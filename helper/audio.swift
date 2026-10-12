// The plugin's line to macOS audio. Node can't reach CoreAudio (the part of
// macOS that owns sound devices), so this small program does it and stays
// running next to the plugin, like a walkie-talkie between the two.
//
// In:  one JSON command per line on stdin
//        {"cmd":"list"}
//        {"cmd":"default","id":"<device id>"}
//        {"cmd":"volume","id":"<device id>","value":40}
//        {"cmd":"mute","id":"<device id>","value":true}
//        {"cmd":"apps"}
//        {"cmd":"key","name":"up"}      (or "down", or "mute")
// Out: one JSON line on stdout with every output device, after each command
//      and whenever something changes on its own (volume keys, menu bar,
//      headphones plugged in). "apps" is the exception: it answers with
//      one line listing the apps that are open.
import AppKit
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
    // The last two are for pressing the volume keys (see press): whether
    // macOS lets me, and whether FineTune is there to hear them.
    let everything: [String: Any] = [
        "devices": devices,
        "canPressKeys": CGPreflightPostEventAccess(),
        "fineTuneOpen": !NSRunningApplication.runningApplications(withBundleIdentifier: fineTuneID).isEmpty,
    ]
    guard let json = try? JSONSerialization.data(withJSONObject: everything) else { return }
    FileHandle.standardOutput.write(json + "\n".data(using: .utf8)!)
}

func device(withID uid: String) -> AudioObjectID? {
    outputDevices().first { text($0, kAudioDevicePropertyDeviceUID) == uid }
}

// The apps with a window or a Dock icon, for the App Volume dial's picker.
// "regular" leaves out the hundreds of background helpers a Mac runs, which
// would bury the three apps I actually want.
func reportApps() {
    var seen = Set<String>()
    var apps: [[String: String]] = []
    for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
        guard let id = app.bundleIdentifier, let name = app.localizedName, seen.insert(id).inserted else { continue }
        apps.append(["id": id, "name": name])
    }
    apps.sort { $0["name"]!.localizedCaseInsensitiveCompare($1["name"]!) == .orderedAscending }
    guard let json = try? JSONSerialization.data(withJSONObject: ["apps": apps]) else { return }
    FileHandle.standardOutput.write(json + "\n".data(using: .utf8)!)
}

let fineTuneID = "com.finetuneapp.FineTune"

// The numbers macOS uses for the three sound keys on the keyboard.
let soundKeys: [String: Int] = ["up": 0, "down": 1, "mute": 7]

// Presses one of the keyboard's sound keys, as if I'd hit F10, F11 or F12.
// This is the only way to turn my monitor: macOS has no volume for it, but
// FineTune listens for these keys and turns it down in software. FineTune
// takes commands for apps and none for devices, so the keys are the door.
//
// A press is two events, key down and key up, and the odd numbers are how
// macOS packs "which key" and "down or up" into one.
func press(_ name: String) {
    guard let key = soundKeys[name] else {
        complain("key: no sound key called \(name)")
        return
    }
    // macOS only lets an app send key presses once it's been allowed in
    // Privacy & Security > Accessibility. Asking makes the prompt show up.
    guard CGPreflightPostEventAccess() else {
        CGRequestPostEventAccess()
        complain("key: macOS hasn't allowed Stream Deck to press keys")
        return
    }
    for down in [true, false] {
        let state = down ? 0xa : 0xb
        let event = NSEvent.otherEvent(with: .systemDefined, location: .zero,
                                       modifierFlags: NSEvent.ModifierFlags(rawValue: UInt(state << 8)),
                                       timestamp: 0, windowNumber: 0, context: nil, subtype: 8,
                                       data1: (key << 16) | (state << 8), data2: -1)
        event?.cgEvent?.post(tap: .cghidEventTap)
    }
}

func run(_ line: String) {
    guard let data = line.data(using: .utf8),
          let command = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let name = command["cmd"] as? String else {
        complain("Not a command: \(line)")
        return
    }
    if name == "apps" {
        reportApps()
        return
    }
    if name == "key" {
        press(command["name"] as? String ?? "")
        report()
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

// FineTune opening or closing changes what the dial can do on my monitor,
// so that gets a report too.
for name in [NSWorkspace.didLaunchApplicationNotification, NSWorkspace.didTerminateApplicationNotification] {
    NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { note in
        let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        if app?.bundleIdentifier == fineTuneID { queueReport() }
    }
}

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
// A run loop and not dispatchMain: the "an app opened" notices above only
// get delivered to a program that's running one.
RunLoop.main.run()
