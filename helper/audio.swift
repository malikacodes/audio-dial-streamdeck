// The plugin's line to macOS audio. Node can't reach CoreAudio (the part of
// macOS that owns sound devices), so this small program does it and stays
// running next to the plugin, like a walkie-talkie between the two.
//
// In:  one JSON command per line on stdin
//        {"cmd":"list"}
//        {"cmd":"default","id":"<device id>"}
//        {"cmd":"volume","id":"<device id>","value":40}
//        {"cmd":"mute","id":"<device id>","value":true}
// Out: one JSON line on stdout with every output device, after each command
//      and whenever something changes on its own (volume keys, menu bar,
//      headphones plugged in).
import AudioToolbox
import CoreAudio
import Foundation

let system = AudioObjectID(kAudioObjectSystemObject)
let output = kAudioDevicePropertyScopeOutput

func address(_ selector: AudioObjectPropertySelector,
             _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
             _ element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: selector, mScope: scope, mElement: element)
}

// The "main volume" is the one slider macOS shows for a device, even when
// the device really has a left and a right volume underneath.
let mainVolume = address(kAudioHardwareServiceDeviceProperty_VirtualMainVolume, output)
let mute = address(kAudioDevicePropertyMute, output)

func text(_ object: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String {
    var where_ = address(selector)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(object, &where_, 0, nil, &size, &value) == noErr, let value else { return "" }
    return value.takeRetainedValue() as String
}

func canSet(_ object: AudioObjectID, _ property: AudioObjectPropertyAddress) -> Bool {
    var where_ = property
    var settable: DarwinBoolean = false
    guard AudioObjectHasProperty(object, &where_) else { return false }
    return AudioObjectIsPropertySettable(object, &where_, &settable) == noErr && settable.boolValue
}

func defaultOutput() -> AudioObjectID {
    var where_ = address(kAudioHardwarePropertyDefaultOutputDevice)
    var id = AudioObjectID(0)
    var size = UInt32(MemoryLayout<AudioObjectID>.size)
    AudioObjectGetPropertyData(system, &where_, 0, nil, &size, &id)
    return id
}

// Every device that can play sound. Microphones are in the same list, so
// anything without an output stream is skipped.
func outputDevices() -> [AudioObjectID] {
    var where_ = address(kAudioHardwarePropertyDevices)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(system, &where_, 0, nil, &size) == noErr else { return [] }
    var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
    guard AudioObjectGetPropertyData(system, &where_, 0, nil, &size, &ids) == noErr else { return [] }
    return ids.filter { id in
        var streams = address(kAudioDevicePropertyStreams, output)
        var streamSize: UInt32 = 0
        return AudioObjectGetPropertyDataSize(id, &streams, 0, nil, &streamSize) == noErr && streamSize > 0
    }
}

func describe(_ id: AudioObjectID, isDefault: Bool) -> [String: Any] {
    var device: [String: Any] = [
        "id": text(id, kAudioDevicePropertyDeviceUID),
        "name": text(id, kAudioObjectPropertyName),
        "isDefault": isDefault,
        // Monitors over HDMI usually say no to both of these: the Mac sends
        // full volume and the monitor's own buttons decide how loud it is.
        "hasVolume": canSet(id, mainVolume),
        "canMute": canSet(id, mute),
        "muted": false,
    ]
    if device["hasVolume"] as! Bool {
        var where_ = mainVolume
        var level: Float32 = 0
        var size = UInt32(MemoryLayout<Float32>.size)
        if AudioObjectGetPropertyData(id, &where_, 0, nil, &size, &level) == noErr {
            device["volume"] = Int((level * 100).rounded())
        }
    }
    if device["canMute"] as! Bool {
        var where_ = mute
        var muted: UInt32 = 0
        var size = UInt32(MemoryLayout<UInt32>.size)
        if AudioObjectGetPropertyData(id, &where_, 0, nil, &size, &muted) == noErr {
            device["muted"] = muted != 0
        }
    }
    return device
}

func complain(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

// Devices I'm already listening to, so a device that's still plugged in
// doesn't get a second listener every time the list changes.
var listening = Set<AudioObjectID>()
var reportQueued = false

// One volume change can fire several listeners at once (left, right, main).
// This waits a moment and sends one report for the whole burst.
func queueReport() {
    if reportQueued { return }
    reportQueued = true
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.03) {
        reportQueued = false
        report()
    }
}

func listen(_ object: AudioObjectID, _ property: AudioObjectPropertyAddress) {
    var where_ = property
    AudioObjectAddPropertyListenerBlock(object, &where_, DispatchQueue.main) { _, _ in queueReport() }
}

func report() {
    let ids = outputDevices()
    for id in ids where !listening.contains(id) {
        listening.insert(id)
        listen(id, mainVolume)
        listen(id, mute)
        // Some devices only announce changes per channel, so I listen to
        // every channel's volume too.
        listen(id, address(kAudioDevicePropertyVolumeScalar, output, kAudioObjectPropertyElementWildcard))
    }
    listening.formIntersection(ids)

    let current = defaultOutput()
    let devices = ids.map { describe($0, isDefault: $0 == current) }
    guard let json = try? JSONSerialization.data(withJSONObject: ["devices": devices]) else { return }
    FileHandle.standardOutput.write(json + "\n".data(using: .utf8)!)
}

func device(withID uid: String) -> AudioObjectID? {
    outputDevices().first { text($0, kAudioDevicePropertyDeviceUID) == uid }
}

func run(_ line: String) {
    guard let data = line.data(using: .utf8),
          let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let name = command["cmd"] as? String else {
        complain("Not a command: \(line)")
        return
    }
    if name != "list" {
        guard let uid = command["id"] as? String, let target = device(withID: uid) else {
            complain("\(name): no output device with that id")
            report()
            return
        }
        var status: OSStatus = noErr
        switch name {
        case "default":
            var where_ = address(kAudioHardwarePropertyDefaultOutputDevice)
            var id = target
            status = AudioObjectSetPropertyData(system, &where_, 0, nil, UInt32(MemoryLayout<AudioObjectID>.size), &id)
        case "volume":
            let percent = (command["value"] as? NSNumber)?.floatValue ?? 0
            var where_ = mainVolume
            var level = Float32(min(max(percent, 0), 100) / 100)
            status = AudioObjectSetPropertyData(target, &where_, 0, nil, UInt32(MemoryLayout<Float32>.size), &level)
        case "mute":
            var where_ = mute
            var muted: UInt32 = (command["value"] as? Bool ?? false) ? 1 : 0
            status = AudioObjectSetPropertyData(target, &where_, 0, nil, UInt32(MemoryLayout<UInt32>.size), &muted)
        default:
            complain("Unknown command: \(name)")
        }
        if status != noErr { complain("\(name) failed with CoreAudio error \(status)") }
    }
    report()
}

listen(system, address(kAudioHardwarePropertyDevices))
listen(system, address(kAudioHardwarePropertyDefaultOutputDevice))

// Commands are read on their own thread so waiting for the next line never
// blocks the listeners. When stdin closes the plugin is gone, so I quit too
// instead of hanging around forever.
Thread.detachNewThread {
    while let line = readLine() {
        DispatchQueue.main.async { run(line) }
    }
    exit(0)
}

report()
dispatchMain()
