import AVFoundation
import Capacitor
import CoreImage
import Photos
import UIKit

/// Native dual-camera recorder. WKWebView can usually open only one camera on
/// iPhone, while AVCaptureMultiCamSession can capture the front and back cameras
/// together on supported devices (iPhone XS / XR and newer).
final class DualDashcamRecorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let queue = DispatchQueue(label: "com.gpsspeedometer.dual-dashcam")
    private let ciContext = CIContext()
    private var session: AVCaptureMultiCamSession?
    private var frontOutput: AVCaptureVideoDataOutput?
    private var rearOutput: AVCaptureVideoDataOutput?
    private var latestFrontBuffer: CVPixelBuffer?
    private var writer: AVAssetWriter?
    private var writerInput: AVAssetWriterInput?
    private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var outputURL: URL?
    private var width = 1280
    private var height = 720
    private var hud = ""

    var isRunning: Bool { session?.isRunning == true }

    func start(width: Int, height: Int, hud: String) throws {
        guard AVCaptureMultiCamSession.isMultiCamSupported else {
            throw NSError(domain: "Dashcam", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "iPhone này không hỗ trợ quay đồng thời cam trước và sau."
            ])
        }
        stopSessionOnly()
        self.width = width
        self.height = height
        self.hud = hud

        let session = AVCaptureMultiCamSession()
        session.beginConfiguration()
        defer { session.commitConfiguration() }

        guard
            let rear = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            let front = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
        else {
            throw NSError(domain: "Dashcam", code: 2, userInfo: [
                NSLocalizedDescriptionKey: "Không tìm thấy đủ camera trước và sau."
            ])
        }

        try addCamera(rear, to: session, isFront: false)
        try addCamera(front, to: session, isFront: true)
        try prepareWriter()
        self.session = session
        session.startRunning()
    }

    func updateHud(_ text: String) {
        queue.async { self.hud = text }
    }

    func stop(completion: @escaping (Result<Void, Error>) -> Void) {
        stopSessionOnly()
        queue.async {
            guard let writer = self.writer, let input = self.writerInput else {
                completion(.failure(NSError(domain: "Dashcam", code: 3, userInfo: [NSLocalizedDescriptionKey: "Chưa có video để lưu."])))
                return
            }
            input.markAsFinished()
            guard writer.status == .writing else {
                completion(.failure(writer.error ?? NSError(domain: "Dashcam", code: 4, userInfo: [NSLocalizedDescriptionKey: "Video chưa có dữ liệu."])))
                return
            }
            writer.finishWriting {
                if writer.status != .completed {
                    completion(.failure(writer.error ?? NSError(domain: "Dashcam", code: 5, userInfo: [NSLocalizedDescriptionKey: "Không thể hoàn tất video."])))
                    return
                }
                guard let url = self.outputURL else {
                    completion(.failure(NSError(domain: "Dashcam", code: 6, userInfo: [NSLocalizedDescriptionKey: "Không tìm thấy file video."])))
                    return
                }
                self.saveToPhotos(url, completion: completion)
            }
        }
    }

    private func addCamera(_ device: AVCaptureDevice, to session: AVCaptureMultiCamSession, isFront: Bool) throws {
        let input = try AVCaptureDeviceInput(device: device)
        guard session.canAddInput(input) else { throw NSError(domain: "Dashcam", code: 7) }
        session.addInputWithNoConnections(input)

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.setSampleBufferDelegate(self, queue: queue)
        guard session.canAddOutput(output) else { throw NSError(domain: "Dashcam", code: 8) }
        session.addOutputWithNoConnections(output)

        guard let port = input.ports.first(where: { $0.mediaType == .video }) else {
            throw NSError(domain: "Dashcam", code: 9)
        }
        let connection = AVCaptureConnection(inputPorts: [port], output: output)
        guard session.canAddConnection(connection) else { throw NSError(domain: "Dashcam", code: 10) }
        session.addConnection(connection)
        if isFront { frontOutput = output } else { rearOutput = output }
    }

    private func prepareWriter() throws {
        let file = FileManager.default.temporaryDirectory
            .appendingPathComponent("dashcam-hud-\(Int(Date().timeIntervalSince1970)).mp4")
        try? FileManager.default.removeItem(at: file)
        let writer = try AVAssetWriter(outputURL: file, fileType: .mp4)
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 6_000_000],
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard writer.canAdd(input) else { throw NSError(domain: "Dashcam", code: 11) }
        writer.add(input)
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ]
        self.writer = writer
        self.writerInput = input
        self.adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attrs)
        self.outputURL = file
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        guard let pixel = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        if output === frontOutput {
            latestFrontBuffer = pixel
            return
        }
        guard output === rearOutput, let adaptor, let input else { return }
        let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if writer?.status == .unknown {
            writer?.startWriting()
            writer?.startSession(atSourceTime: time)
        }
        guard writer?.status == .writing, let pool = adaptor.pixelBufferPool else { return }
        var outputPixel: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &outputPixel) == kCVReturnSuccess, let outputPixel else { return }
        drawComposite(rear: pixel, front: latestFrontBuffer, into: outputPixel)
        if input.isReadyForMoreMediaData {
            adaptor.append(outputPixel, withPresentationTime: time)
        }
    }

    private func drawComposite(rear: CVPixelBuffer, front: CVPixelBuffer?, into output: CVPixelBuffer) {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        CVPixelBufferLockBaseAddress(output, [])
        defer { CVPixelBufferUnlockBaseAddress(output, []) }
        guard let context = CGContext(
            data: CVPixelBufferGetBaseAddress(output),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(output),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue,
        ) else { return }
        context.setFillColor(UIColor.black.cgColor)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        if let image = ciContext.createCGImage(CIImage(cvPixelBuffer: rear), from: CIImage(cvPixelBuffer: rear).extent) {
            drawAspectFill(image, in: CGRect(x: 0, y: 0, width: width, height: height), context: context)
        }
        if let front, let image = ciContext.createCGImage(CIImage(cvPixelBuffer: front), from: CIImage(cvPixelBuffer: front).extent) {
            let pane = CGRect(x: CGFloat(width) * 0.72, y: CGFloat(height) * 0.56, width: CGFloat(width) * 0.24, height: CGFloat(height) * 0.34)
            context.setFillColor(UIColor.white.cgColor)
            context.fill(pane.insetBy(dx: -3, dy: -3))
            drawAspectFill(image, in: pane, context: context)
        }
        UIGraphicsPushContext(context)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 4
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: max(18, CGFloat(width) * 0.024), weight: .bold),
            .foregroundColor: UIColor.white,
            .paragraphStyle: paragraph,
        ]
        (hud as NSString).draw(in: CGRect(x: 28, y: 28, width: CGFloat(width) * 0.65, height: CGFloat(height) * 0.28), withAttributes: attrs)
        UIGraphicsPopContext()
    }

    private func drawAspectFill(_ image: CGImage, in rect: CGRect, context: CGContext) {
        let scale = max(rect.width / CGFloat(image.width), rect.height / CGFloat(image.height))
        let size = CGSize(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
        let target = CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height)
        context.draw(image, in: target)
    }

    private func stopSessionOnly() {
        session?.stopRunning()
        session = nil
        frontOutput = nil
        rearOutput = nil
        latestFrontBuffer = nil
    }

    private func saveToPhotos(_ url: URL, completion: @escaping (Result<Void, Error>) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                completion(.failure(NSError(domain: "Dashcam", code: 12, userInfo: [NSLocalizedDescriptionKey: "Chưa cấp quyền lưu video vào Ảnh."])))
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { ok, error in
                ok ? completion(.success(())) : completion(.failure(error ?? NSError(domain: "Dashcam", code: 13)))
            }
        }
    }
}

@objc(DashcamNativePlugin)
public class DashcamNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DashcamNativePlugin"
    public let jsName = "DashcamNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startDual", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateHud", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]
    private let recorder = DualDashcamRecorder()

    @objc func startDual(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                try self.recorder.start(
                    width: call.getInt("width") ?? 1280,
                    height: call.getInt("height") ?? 720,
                    hud: call.getString("hud") ?? "GPS Speedometer",
                )
                call.resolve(["recording": true])
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func updateHud(_ call: CAPPluginCall) {
        recorder.updateHud(call.getString("text") ?? "")
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        recorder.stop { result in
            DispatchQueue.main.async {
                switch result {
                case .success: call.resolve(["saved": true])
                case .failure(let error): call.reject(error.localizedDescription, nil, error)
                }
            }
        }
    }
}
