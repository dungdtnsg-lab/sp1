import AVFoundation
import Capacitor
import CoreLocation
import UIKit

final class LocationKeeper: NSObject, CLLocationManagerDelegate {
    static let shared = LocationKeeper()

    private let manager = CLLocationManager()
    private var player: AVAudioPlayer?
    private var running = false
    private var buffer: [[String: Any]] = []
    private var lastPayload: [String: Any] = [:]
    weak var plugin: CAPPlugin?

    private override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 9.0, *) {
            manager.allowsBackgroundLocationUpdates = true
        }
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
    }

    var isRunning: Bool { running }

    var authLabel: String {
        switch manager.authorizationStatus {
        case .authorizedAlways: return "always"
        case .authorizedWhenInUse: return "whenInUse"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "prompt"
        }
    }

    private var canRunInBackground: Bool {
        manager.authorizationStatus == .authorizedAlways
    }

    func start() {
        running = true
        startAudio()
        requestAuthThenTrack()
    }

    func stop() {
        running = false
        manager.stopUpdatingLocation()
        manager.stopUpdatingHeading()
        manager.stopMonitoringSignificantLocationChanges()
        player?.stop()
        player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func drain() -> [[String: Any]] {
        let out = buffer
        buffer.removeAll(keepingCapacity: true)
        return out
    }

    func status() -> [String: Any] {
        [
            "running": running,
            "auth": authLabel,
            "backgroundReady": canRunInBackground,
            "buffered": buffer.count,
            "last": lastPayload,
        ]
    }

    private func requestAuthThenTrack() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            beginTracking()
        case .authorizedAlways:
            beginTracking()
        default:
            emitError("Chưa cấp quyền vị trí. Cài đặt → GPS Speedometer → Vị trí → Luôn luôn.")
        }
    }

    private func beginTracking() {
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = kCLDistanceFilterNone
        manager.pausesLocationUpdatesAutomatically = false
        if Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") != nil {
            manager.allowsBackgroundLocationUpdates = true
        }
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
        manager.startUpdatingHeading()
        // Recovery path for long iOS suspensions. Standard updates remain the
        // high-accuracy source while a trip is running.
        manager.startMonitoringSignificantLocationChanges()
    }

    private func startAudio() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .voicePrompt, options: [.mixWithOthers])
            try session.setActive(true)
            player = try AVAudioPlayer(data: Self.quietToneWav())
            player?.numberOfLoops = -1
            player?.volume = 0.04
            player?.play()
        } catch {
            /* ignore */
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard running else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            beginTracking()
        case .authorizedAlways:
            beginTracking()
        case .denied, .restricted:
            emitError("Quyền vị trí bị từ chối.")
        default:
            break
        }
        emitAuthorization()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running else { return }
        for loc in locations {
            emit(loc)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let ns = error as NSError
        if ns.domain == kCLErrorDomain && ns.code == 0 { return }
        emitError(error.localizedDescription)
    }

    private func emit(_ loc: CLLocation) {
        let speed = loc.speed >= 0 ? loc.speed : 0.0
        var heading: Double = 0
        if let h = manager.heading, h.trueHeading >= 0 {
            heading = h.trueHeading
        } else if loc.course >= 0 {
            heading = loc.course
        }
        let payload: [String: Any] = [
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            "altitude": loc.altitude,
            "accuracy": loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : 10,
            "speed": speed,
            "heading": heading,
            "timestamp": loc.timestamp.timeIntervalSince1970 * 1000,
        ]
        lastPayload = payload
        buffer.append(payload)
        if buffer.count > 4000 {
            buffer.removeFirst(buffer.count - 4000)
        }
        plugin?.notifyListeners("fix", data: payload)
    }

    private func emitError(_ message: String) {
        plugin?.notifyListeners("error", data: ["message": message])
    }

    private func emitAuthorization() {
        plugin?.notifyListeners("authorization", data: [
            "auth": authLabel,
            "backgroundReady": canRunInBackground,
        ])
    }

    private static func quietToneWav() -> Data {
        let sampleRate = 22050
        let seconds = 2
        let n = sampleRate * seconds
        var data = Data()
        func u16(_ v: UInt16) {
            var x = v.littleEndian
            data.append(Data(bytes: &x, count: 2))
        }
        func u32(_ v: UInt32) {
            var x = v.littleEndian
            data.append(Data(bytes: &x, count: 4))
        }
        data.append(contentsOf: Array("RIFF".utf8))
        u32(UInt32(36 + n * 2))
        data.append(contentsOf: Array("WAVEfmt ".utf8))
        u32(16)
        u16(1)
        u16(1)
        u32(UInt32(sampleRate))
        u32(UInt32(sampleRate * 2))
        u16(2)
        u16(16)
        data.append(contentsOf: Array("data".utf8))
        u32(UInt32(n * 2))
        for i in 0..<n {
            let sample = Int16(sin(2.0 * Double.pi * 18.0 * Double(i) / Double(sampleRate)) * 90)
            var s = sample.littleEndian
            data.append(Data(bytes: &s, count: 2))
        }
        return data
    }
}

@objc(BackgroundGpsPlugin)
public class BackgroundGpsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BackgroundGpsPlugin"
    public let jsName = "BackgroundGps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drain", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        super.load()
        LocationKeeper.shared.plugin = self
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationKeeper.shared.plugin = self
            LocationKeeper.shared.start()
            call.resolve([
                "ok": true,
                "auth": LocationKeeper.shared.authLabel,
                "backgroundReady": LocationKeeper.shared.authLabel == "always",
            ])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationKeeper.shared.stop()
            call.resolve()
        }
    }

    @objc func drain(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["points": LocationKeeper.shared.drain()])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(LocationKeeper.shared.status())
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Không thể mở Cài đặt.")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                opened ? call.resolve() : call.reject("Không thể mở Cài đặt.")
            }
        }
    }
}
