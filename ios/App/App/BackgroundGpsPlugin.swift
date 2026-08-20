import AVFoundation
import Capacitor
import CoreLocation
import UIKit

@objc(BackgroundGpsPlugin)
public class BackgroundGpsPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "BackgroundGpsPlugin"
    public let jsName = "BackgroundGps"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let manager = CLLocationManager()
    private var player: AVAudioPlayer?
    private var running = false
    private var configured = false

    override public func load() {
        super.load()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = 1
        manager.activityType = .automotiveNavigation
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = true
            self.startAudio()
            self.requestAuthThenTrack()
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.running = false
            self.manager.stopUpdatingLocation()
            self.manager.stopUpdatingHeading()
            self.player?.stop()
            self.player = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve()
        }
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
            notifyListeners("error", data: ["message": "Chưa cấp quyền vị trí. Vào Cài đặt → GPS Speedometer → Vị trí → Luôn luôn."])
        }
    }

    private func beginTracking() {
        if Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") != nil {
            manager.allowsBackgroundLocationUpdates = true
        }
        manager.pausesLocationUpdatesAutomatically = false
        if #available(iOS 11.0, *) {
            manager.showsBackgroundLocationIndicator = true
        }
        manager.startUpdatingLocation()
        manager.startUpdatingHeading()
    }

    private func startAudio() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
            let wav = Data(base64Encoded: "UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA")!
            player = try AVAudioPlayer(data: wav)
            player?.numberOfLoops = -1
            player?.volume = 0.03
            player?.play()
        } catch {
            /* ignore */
        }
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard running else { return }
        switch manager.authorizationStatus {
        case .authorizedWhenInUse:
            manager.requestAlwaysAuthorization()
            beginTracking()
        case .authorizedAlways:
            beginTracking()
        case .denied, .restricted:
            notifyListeners("error", data: ["message": "Quyền vị trí bị từ chối."])
        default:
            break
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard running, let loc = locations.last else { return }
        let speed = loc.speed >= 0 ? loc.speed : 0
        var heading: Double = 0
        if let h = manager.heading, h.trueHeading >= 0 {
            heading = h.trueHeading
        } else if loc.course >= 0 {
            heading = loc.course
        }
        notifyListeners("fix", data: [
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            "altitude": loc.altitude,
            "accuracy": loc.horizontalAccuracy >= 0 ? loc.horizontalAccuracy : 10,
            "speed": speed,
            "heading": heading,
            "timestamp": loc.timestamp.timeIntervalSince1970 * 1000,
        ])
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        let ns = error as NSError
        if ns.domain == kCLErrorDomain && ns.code == 0 { return }
        notifyListeners("error", data: ["message": error.localizedDescription])
    }
}
