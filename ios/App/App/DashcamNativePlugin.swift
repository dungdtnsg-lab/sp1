import AVFoundation
import Capacitor
import CoreImage
import Photos
import UIKit

private let dashcamAlbumName = "GPS Speedometer"
private let dashcamAudioWarning = "Video camera hành trình hiện chưa ghi âm thanh."

private enum DashcamMode: String {
    case rear
    case front
    case dual
}

private enum DashcamState {
    case idle
    case starting
    case recording
    case stopping
}

private struct DashcamStartResult {
    let mode: DashcamMode
    let width: Int
    let height: Int
}

private struct DashcamStopResult {
    let saved: Bool
    let assetIdentifier: String?
    let path: String
    let name: String
    let createdAt: String
    let duration: Double
    let mode: DashcamMode
    let error: String?
}

private enum DashcamError {
    static func make(_ code: Int, _ message: String) -> NSError {
        NSError(
            domain: "com.gps.speedometer.dashcam",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

/// Captures rear, front, or simultaneous rear/front video and burns the HUD
/// into every encoded frame. Audio is intentionally omitted until an audio
/// capture/writer path can be tested without destabilizing video recording.
private final class NativeDashcamRecorder: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let sessionQueue = DispatchQueue(label: "com.gps.speedometer.dashcam.session")
    private let videoQueue = DispatchQueue(label: "com.gps.speedometer.dashcam.video")
    private let ciContext = CIContext(options: [.cacheIntermediates: false])
    private let colorSpace = CGColorSpaceCreateDeviceRGB()

    // Accessed on sessionQueue unless explicitly noted otherwise.
    private var state: DashcamState = .idle
    private var session: AVCaptureSession?
    private var mode: DashcamMode = .rear
    private var outputWidth = 1280
    private var outputHeight = 720
    private var outputURL: URL?
    private var outputName = ""
    private var createdAt = Date()

    // Installed before startRunning and then accessed on videoQueue.
    private var primaryOutput: AVCaptureVideoDataOutput?
    private var secondaryOutput: AVCaptureVideoDataOutput?
    private var latestSecondaryBuffer: CVPixelBuffer?
    private var writer: AVAssetWriter?
    private var writerInput: AVAssetWriterInput?
    private var writerAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var firstTimestamp: CMTime?
    private var lastTimestamp: CMTime?
    private var recordingError: Error?
    private var hud = ""

    func start(
        mode: DashcamMode,
        width: Int,
        height: Int,
        hud: String,
        completion: @escaping (Result<DashcamStartResult, Error>) -> Void
    ) {
        sessionQueue.async {
            guard self.state == .idle else {
                completion(.failure(DashcamError.make(1, "Camera đang ghi hoặc đang hoàn tất video trước.")))
                return
            }
            self.state = .starting
            self.authorizeCamera { authorized in
                guard authorized else {
                    self.state = .idle
                    completion(.failure(DashcamError.make(
                        2,
                        "Chưa cấp quyền Camera. Mở Cài đặt > GPS Speedometer > Camera để cho phép."
                    )))
                    return
                }

                do {
                    let result = try self.configureAndStart(
                        mode: mode,
                        width: width,
                        height: height,
                        hud: hud
                    )
                    self.state = .recording
                    completion(.success(result))
                } catch {
                    self.stopSessionOnly()
                    self.videoQueue.sync {
                        self.writer?.cancelWriting()
                        self.resetVideoState(removeIncompleteFile: true)
                    }
                    self.state = .idle
                    completion(.failure(error))
                }
            }
        }
    }

    func updateHud(_ text: String) {
        videoQueue.async {
            self.hud = text
        }
    }

    func stop(completion: @escaping (Result<DashcamStopResult, Error>) -> Void) {
        sessionQueue.async {
            guard self.state == .recording else {
                completion(.failure(DashcamError.make(3, "Camera chưa ghi hoặc đang hoàn tất video.")))
                return
            }
            self.state = .stopping
            self.stopSessionOnly()

            // All sample callbacks already queued on videoQueue run before this
            // block, so the writer can be finalized without racing an append.
            self.videoQueue.async {
                self.finishWriter { result in
                    self.sessionQueue.async {
                        self.state = .idle
                        completion(result)
                    }
                }
            }
        }
    }

    private func authorizeCamera(_ completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { granted in
                self.sessionQueue.async {
                    completion(granted)
                }
            }
        case .denied, .restricted:
            completion(false)
        @unknown default:
            completion(false)
        }
    }

    private func configureAndStart(
        mode: DashcamMode,
        width: Int,
        height: Int,
        hud: String
    ) throws -> DashcamStartResult {
        let safeWidth = Self.evenDimension(width, fallback: 1280, maximum: 1920)
        let safeHeight = Self.evenDimension(height, fallback: 720, maximum: 1080)
        let captureSession: AVCaptureSession

        if mode == .dual {
            guard AVCaptureMultiCamSession.isMultiCamSupported else {
                throw DashcamError.make(4, "iPhone này không hỗ trợ quay đồng thời camera trước và sau.")
            }
            captureSession = AVCaptureMultiCamSession()
        } else {
            captureSession = AVCaptureSession()
        }

        self.mode = mode
        outputWidth = safeWidth
        outputHeight = safeHeight
        createdAt = Date()
        self.hud = hud

        captureSession.beginConfiguration()
        do {
            switch mode {
            case .rear:
                primaryOutput = try addCamera(
                    position: .back,
                    to: captureSession,
                    multiCam: false,
                    targetWidth: safeWidth,
                    targetHeight: safeHeight
                )
                secondaryOutput = nil
            case .front:
                primaryOutput = try addCamera(
                    position: .front,
                    to: captureSession,
                    multiCam: false,
                    targetWidth: safeWidth,
                    targetHeight: safeHeight
                )
                secondaryOutput = nil
            case .dual:
                // 720p capture formats keep MultiCam hardware pressure stable;
                // the compositor scales to the requested output dimensions.
                let captureWidth = min(safeWidth, 1280)
                let captureHeight = min(safeHeight, 720)
                primaryOutput = try addCamera(
                    position: .back,
                    to: captureSession,
                    multiCam: true,
                    targetWidth: captureWidth,
                    targetHeight: captureHeight
                )
                secondaryOutput = try addCamera(
                    position: .front,
                    to: captureSession,
                    multiCam: true,
                    targetWidth: captureWidth,
                    targetHeight: captureHeight
                )
            }
            captureSession.commitConfiguration()
        } catch {
            // Every beginConfiguration must be balanced, including failures.
            captureSession.commitConfiguration()
            throw error
        }

        if let multiCamSession = captureSession as? AVCaptureMultiCamSession,
           multiCamSession.hardwareCost > 1.0 {
            throw DashcamError.make(
                5,
                "Cấu hình hai camera vượt khả năng phần cứng của iPhone này. Hãy chọn 720p."
            )
        }

        try prepareWriter(width: safeWidth, height: safeHeight)
        session = captureSession

        // startRunning is deliberately after commitConfiguration and off the
        // main thread. Calling it inside a configuration block raises an
        // Objective-C exception that Swift cannot catch.
        captureSession.startRunning()
        guard captureSession.isRunning else {
            throw DashcamError.make(6, "Không khởi động được camera. Camera có thể đang được ứng dụng khác sử dụng.")
        }

        return DashcamStartResult(mode: mode, width: safeWidth, height: safeHeight)
    }

    private func addCamera(
        position: AVCaptureDevice.Position,
        to captureSession: AVCaptureSession,
        multiCam: Bool,
        targetWidth: Int,
        targetHeight: Int
    ) throws -> AVCaptureVideoDataOutput {
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position) else {
            let label = position == .front ? "trước" : "sau"
            throw DashcamError.make(7, "Không tìm thấy camera \(label).")
        }
        try configure(
            device: device,
            multiCam: multiCam,
            targetWidth: targetWidth,
            targetHeight: targetHeight
        )

        let input = try AVCaptureDeviceInput(device: device)
        guard captureSession.canAddInput(input) else {
            throw DashcamError.make(8, "Không thể thêm camera vào phiên ghi hình.")
        }
        captureSession.addInputWithNoConnections(input)
        if multiCam {
            // Adding an input resets this property, so apply the 30 fps limit
            // only after it belongs to the session and before startRunning.
            input.videoMinFrameDurationOverride = CMTime(value: 1, timescale: 30)
        }

        let output = AVCaptureVideoDataOutput()
        output.alwaysDiscardsLateVideoFrames = true
        output.videoSettings = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ]
        output.setSampleBufferDelegate(self, queue: videoQueue)
        guard captureSession.canAddOutput(output) else {
            throw DashcamError.make(9, "Không thể nhận khung hình từ camera.")
        }
        captureSession.addOutputWithNoConnections(output)

        guard let port = input.ports.first(where: { $0.mediaType == .video }) else {
            throw DashcamError.make(10, "Camera không có cổng video.")
        }
        let connection = AVCaptureConnection(inputPorts: [port], output: output)
        guard captureSession.canAddConnection(connection) else {
            throw DashcamError.make(11, "Không thể kết nối camera với bộ ghi video.")
        }
        captureSession.addConnection(connection)

        if connection.isVideoOrientationSupported {
            connection.videoOrientation = .landscapeRight
        }
        if position == .front, connection.isVideoMirroringSupported {
            // AVFoundation throws NSInvalidArgumentException when
            // isVideoMirrored is set while automatic adjustment is enabled.
            connection.automaticallyAdjustsVideoMirroring = false
            connection.isVideoMirrored = true
        }
        return output
    }

    private func configure(
        device: AVCaptureDevice,
        multiCam: Bool,
        targetWidth: Int,
        targetHeight: Int
    ) throws {
        let formats = device.formats.filter { format in
            guard !multiCam || format.isMultiCamSupported else { return false }
            return format.videoSupportedFrameRateRanges.contains { $0.maxFrameRate >= 24 }
        }
        guard !formats.isEmpty else {
            throw DashcamError.make(12, "Camera không có định dạng phù hợp để ghi hình.")
        }

        let targetArea = Int64(targetWidth) * Int64(targetHeight)
        let larger = formats.filter { format in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return Int64(dimensions.width) * Int64(dimensions.height) >= targetArea
        }
        let candidates = larger.isEmpty ? formats : larger
        let chosen = candidates.min { lhs, rhs in
            let left = CMVideoFormatDescriptionGetDimensions(lhs.formatDescription)
            let right = CMVideoFormatDescriptionGetDimensions(rhs.formatDescription)
            let leftArea = Int64(left.width) * Int64(left.height)
            let rightArea = Int64(right.width) * Int64(right.height)
            return abs(leftArea - targetArea) < abs(rightArea - targetArea)
        } ?? formats[0]

        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.activeFormat = chosen
        if let range = chosen.videoSupportedFrameRateRanges.first(where: {
            $0.minFrameRate <= 30 && $0.maxFrameRate >= 30
        }) {
            let frameDuration = CMTime(value: 1, timescale: 30)
            if frameDuration >= range.minFrameDuration && frameDuration <= range.maxFrameDuration {
                device.activeVideoMinFrameDuration = frameDuration
                device.activeVideoMaxFrameDuration = frameDuration
            }
        }
    }

    private func prepareWriter(width: Int, height: Int) throws {
        let directory = try dashcamDirectory()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss-SSS"
        let name = "dashcam-\(mode.rawValue)-\(formatter.string(from: createdAt)).mp4"
        let url = directory.appendingPathComponent(name, isDirectory: false)
        try? FileManager.default.removeItem(at: url)

        let assetWriter = try AVAssetWriter(outputURL: url, fileType: .mp4)
        let compression: [String: Any] = [
            AVVideoAverageBitRateKey: width >= 1920 ? 8_000_000 : 5_000_000,
            AVVideoExpectedSourceFrameRateKey: 30,
            AVVideoMaxKeyFrameIntervalKey: 60,
        ]
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: compression,
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = true
        guard assetWriter.canAdd(input) else {
            throw DashcamError.make(13, "iPhone không hỗ trợ cấu hình mã hóa video này.")
        }
        assetWriter.add(input)

        let attributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [:],
        ]
        writer = assetWriter
        writerInput = input
        writerAdaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: attributes
        )
        outputURL = url
        outputName = name
        firstTimestamp = nil
        lastTimestamp = nil
        recordingError = nil
        latestSecondaryBuffer = nil
    }

    private func dashcamDirectory() throws -> URL {
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            throw DashcamError.make(14, "Không tìm thấy thư mục lưu video của ứng dụng.")
        }
        let directory = documents.appendingPathComponent("Dashcam", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: nil
        )
        return directory
    }

    func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        if output === secondaryOutput {
            latestSecondaryBuffer = pixelBuffer
            return
        }
        guard output === primaryOutput,
              recordingError == nil,
              let assetWriter = writer,
              let input = writerInput,
              let adaptor = writerAdaptor else { return }

        let timestamp = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        if assetWriter.status == .unknown {
            guard assetWriter.startWriting() else {
                recordingError = assetWriter.error ?? DashcamError.make(15, "Không bắt đầu được bộ mã hóa video.")
                return
            }
            assetWriter.startSession(atSourceTime: timestamp)
            firstTimestamp = timestamp
        }
        guard assetWriter.status == .writing else {
            recordingError = assetWriter.error ?? DashcamError.make(16, "Bộ mã hóa video đã dừng bất ngờ.")
            return
        }
        guard input.isReadyForMoreMediaData else { return }
        guard let pool = adaptor.pixelBufferPool else {
            recordingError = DashcamError.make(17, "Không tạo được vùng nhớ cho khung hình video.")
            return
        }

        var destination: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(nil, pool, &destination)
        guard status == kCVReturnSuccess, let destination else {
            recordingError = DashcamError.make(18, "Không cấp phát được khung hình video.")
            return
        }
        render(primary: pixelBuffer, secondary: latestSecondaryBuffer, into: destination)
        guard adaptor.append(destination, withPresentationTime: timestamp) else {
            recordingError = assetWriter.error ?? DashcamError.make(19, "Không ghi được khung hình vào file video.")
            return
        }
        lastTimestamp = timestamp
    }

    private func render(primary: CVPixelBuffer, secondary: CVPixelBuffer?, into destination: CVPixelBuffer) {
        let canvas = CGRect(x: 0, y: 0, width: outputWidth, height: outputHeight)
        var composition = CIImage(color: CIColor.black).cropped(to: canvas)
        let mainImage = aspectFill(CIImage(cvPixelBuffer: primary), into: canvas)
        composition = mainImage.composited(over: composition)

        if mode == .dual, let secondary {
            let pane = CGRect(
                x: CGFloat(outputWidth) * 0.72,
                y: CGFloat(outputHeight) * 0.06,
                width: CGFloat(outputWidth) * 0.24,
                height: CGFloat(outputHeight) * 0.34
            )
            let border = CIImage(color: CIColor.white).cropped(to: pane.insetBy(dx: -3, dy: -3))
            let inset = aspectFill(CIImage(cvPixelBuffer: secondary), into: pane)
            composition = inset.composited(over: border).composited(over: composition)
        }

        ciContext.render(composition, to: destination, bounds: canvas, colorSpace: colorSpace)
        drawHud(into: destination)
    }

    private func aspectFill(_ image: CIImage, into rect: CGRect) -> CIImage {
        let extent = image.extent
        guard extent.width > 0, extent.height > 0 else { return image }
        let normalized = image.transformed(
            by: CGAffineTransform(translationX: -extent.origin.x, y: -extent.origin.y)
        )
        let scale = max(rect.width / extent.width, rect.height / extent.height)
        let scaled = normalized.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        let x = rect.midX - scaled.extent.width / 2
        let y = rect.midY - scaled.extent.height / 2
        return scaled
            .transformed(by: CGAffineTransform(translationX: x, y: y))
            .cropped(to: rect)
    }

    private func drawHud(into pixelBuffer: CVPixelBuffer) {
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
        guard let baseAddress = CVPixelBufferGetBaseAddress(pixelBuffer) else { return }

        let bitmapInfo = CGBitmapInfo.byteOrder32Little.rawValue
            | CGImageAlphaInfo.premultipliedFirst.rawValue
        guard let context = CGContext(
            data: baseAddress,
            width: outputWidth,
            height: outputHeight,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: bitmapInfo
        ) else { return }

        context.saveGState()
        context.translateBy(x: 0, y: CGFloat(outputHeight))
        context.scaleBy(x: 1, y: -1)
        let fontSize = max(18, CGFloat(outputWidth) * 0.026)
        let padding = max(18, CGFloat(outputWidth) * 0.025)
        let lines = max(1, hud.split(separator: "\n", omittingEmptySubsequences: false).count)
        let boxHeight = padding * 2 + CGFloat(lines) * (fontSize + 5)
        context.setFillColor(UIColor.black.withAlphaComponent(0.52).cgColor)
        context.fill(CGRect(x: 0, y: 0, width: CGFloat(outputWidth), height: boxHeight))

        UIGraphicsPushContext(context)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 5
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.monospacedSystemFont(ofSize: fontSize, weight: .bold),
            .foregroundColor: UIColor.white,
            .paragraphStyle: paragraph,
        ]
        (hud as NSString).draw(
            in: CGRect(
                x: padding,
                y: padding,
                width: CGFloat(outputWidth) - padding * 2,
                height: boxHeight - padding
            ),
            withAttributes: attributes
        )
        UIGraphicsPopContext()
        context.restoreGState()
    }

    private func finishWriter(completion: @escaping (Result<DashcamStopResult, Error>) -> Void) {
        guard let assetWriter = writer,
              let input = writerInput,
              let url = outputURL else {
            completion(.failure(DashcamError.make(20, "Không tìm thấy bộ ghi video.")))
            return
        }
        if let recordingError {
            assetWriter.cancelWriting()
            resetVideoState(removeIncompleteFile: true)
            completion(.failure(recordingError))
            return
        }
        guard assetWriter.status == .writing, firstTimestamp != nil, lastTimestamp != nil else {
            assetWriter.cancelWriting()
            resetVideoState(removeIncompleteFile: true)
            completion(.failure(DashcamError.make(21, "Video chưa có dữ liệu. Hãy quay ít nhất 3 giây.")))
            return
        }

        let duration = max(0, CMTimeGetSeconds(CMTimeSubtract(lastTimestamp!, firstTimestamp!)))
        let resultMode = mode
        let resultName = outputName
        let resultCreatedAt = ISO8601DateFormatter().string(from: createdAt)
        input.markAsFinished()
        assetWriter.finishWriting {
            guard assetWriter.status == .completed else {
                let error = assetWriter.error ?? DashcamError.make(22, "Không hoàn tất được file video.")
                self.videoQueue.async {
                    self.resetVideoState(removeIncompleteFile: true)
                    completion(.failure(error))
                }
                return
            }

            self.saveVideoToPhotos(url: url, createdAt: self.createdAt) { photoResult in
                self.videoQueue.async {
                    self.resetVideoState(removeIncompleteFile: false)
                    switch photoResult {
                    case .success(let identifier):
                        completion(.success(DashcamStopResult(
                            saved: true,
                            assetIdentifier: identifier,
                            path: url.absoluteString,
                            name: resultName,
                            createdAt: resultCreatedAt,
                            duration: duration.isFinite ? duration : 0,
                            mode: resultMode,
                            error: nil
                        )))
                    case .failure(let error):
                        // Keep the durable Documents/Dashcam file and return an
                        // explicit saved=false result so the app gallery can
                        // still display/retry it without claiming Photos saved.
                        completion(.success(DashcamStopResult(
                            saved: false,
                            assetIdentifier: nil,
                            path: url.absoluteString,
                            name: resultName,
                            createdAt: resultCreatedAt,
                            duration: duration.isFinite ? duration : 0,
                            mode: resultMode,
                            error: error.localizedDescription
                        )))
                    }
                }
            }
        }
    }

    private func stopSessionOnly() {
        session?.stopRunning()
        session = nil
    }

    private func resetVideoState(removeIncompleteFile: Bool) {
        if removeIncompleteFile, let outputURL {
            try? FileManager.default.removeItem(at: outputURL)
        }
        primaryOutput = nil
        secondaryOutput = nil
        latestSecondaryBuffer = nil
        writer = nil
        writerInput = nil
        writerAdaptor = nil
        outputURL = nil
        outputName = ""
        firstTimestamp = nil
        lastTimestamp = nil
        recordingError = nil
    }

    private func saveVideoToPhotos(
        url: URL,
        createdAt: Date,
        completion: @escaping (Result<String, Error>) -> Void
    ) {
        authorizePhotos { authorized in
            guard authorized else {
                completion(.failure(DashcamError.make(
                    23,
                    "Chưa cấp quyền Ảnh. Video vẫn được giữ trong thư viện Camera của ứng dụng."
                )))
                return
            }
            self.findOrCreateAlbum { albumResult in
                switch albumResult {
                case .failure(let error):
                    completion(.failure(error))
                case .success(let album):
                    var identifier: String?
                    var madeAsset = false
                    PHPhotoLibrary.shared().performChanges({
                        let creation = PHAssetCreationRequest.forAsset()
                        creation.creationDate = createdAt
                        let options = PHAssetResourceCreationOptions()
                        options.shouldMoveFile = false
                        creation.addResource(with: .video, fileURL: url, options: options)
                        if let placeholder = creation.placeholderForCreatedAsset,
                           let albumChange = PHAssetCollectionChangeRequest(for: album) {
                            identifier = placeholder.localIdentifier
                            albumChange.addAssets([placeholder] as NSArray)
                            madeAsset = true
                        }
                    }) { success, error in
                        guard success, madeAsset, let identifier else {
                            completion(.failure(error ?? DashcamError.make(
                                24,
                                "Không thể lưu video vào album \(dashcamAlbumName)."
                            )))
                            return
                        }
                        completion(.success(identifier))
                    }
                }
            }
        }
    }

    private func authorizePhotos(_ completion: @escaping (Bool) -> Void) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch status {
        case .authorized, .limited:
            completion(true)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { newStatus in
                completion(newStatus == .authorized || newStatus == .limited)
            }
        case .denied, .restricted:
            completion(false)
        @unknown default:
            completion(false)
        }
    }

    private func findOrCreateAlbum(
        completion: @escaping (Result<PHAssetCollection, Error>) -> Void
    ) {
        if let album = findAlbum() {
            completion(.success(album))
            return
        }

        var placeholder: PHObjectPlaceholder?
        PHPhotoLibrary.shared().performChanges({
            let request = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(
                withTitle: dashcamAlbumName
            )
            placeholder = request.placeholderForCreatedAssetCollection
        }) { success, error in
            guard success, let identifier = placeholder?.localIdentifier else {
                completion(.failure(error ?? DashcamError.make(
                    25,
                    "Không thể tạo album \(dashcamAlbumName)."
                )))
                return
            }
            let fetched = PHAssetCollection.fetchAssetCollections(
                withLocalIdentifiers: [identifier],
                options: nil
            )
            guard let album = fetched.firstObject else {
                completion(.failure(DashcamError.make(
                    26,
                    "Đã tạo album nhưng không thể mở album \(dashcamAlbumName)."
                )))
                return
            }
            completion(.success(album))
        }
    }

    private func findAlbum() -> PHAssetCollection? {
        let options = PHFetchOptions()
        options.predicate = NSPredicate(format: "localizedTitle = %@", dashcamAlbumName)
        let fetched = PHAssetCollection.fetchAssetCollections(
            with: .album,
            subtype: .albumRegular,
            options: options
        )
        var writableAlbum: PHAssetCollection?
        fetched.enumerateObjects { album, _, stop in
            guard album.canPerform(.addContent) else { return }
            writableAlbum = album
            stop.pointee = true
        }
        return writableAlbum
    }

    private static func evenDimension(_ value: Int, fallback: Int, maximum: Int) -> Int {
        let selected = value > 0 ? value : fallback
        let clamped = min(max(selected, 320), maximum)
        return clamped.isMultiple(of: 2) ? clamped : clamped - 1
    }
}

@objc(DashcamNativePlugin)
public final class DashcamNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DashcamNativePlugin"
    public let jsName = "DashcamNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateHud", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
    ]

    private let recorder = NativeDashcamRecorder()

    @objc func start(_ call: CAPPluginCall) {
        guard let rawMode = call.getString("mode"), let mode = DashcamMode(rawValue: rawMode) else {
            call.reject("mode phải là rear, front hoặc dual.", "argumentError")
            return
        }
        recorder.start(
            mode: mode,
            width: call.getInt("width") ?? 1280,
            height: call.getInt("height") ?? 720,
            hud: call.getString("hud") ?? "GPS Speedometer"
        ) { result in
            DispatchQueue.main.async {
                switch result {
                case .failure(let error):
                    call.reject(error.localizedDescription, "dashcamError", error)
                case .success(let value):
                    call.resolve([
                        "recording": true,
                        "mode": value.mode.rawValue,
                        "width": value.width,
                        "height": value.height,
                        "hasAudio": false,
                        "warning": dashcamAudioWarning,
                    ])
                }
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
                case .failure(let error):
                    call.reject(error.localizedDescription, "dashcamError", error)
                case .success(let value):
                    var payload: [String: Any] = [
                        "saved": value.saved,
                        "path": value.path,
                        "name": value.name,
                        "createdAt": value.createdAt,
                        "duration": value.duration,
                        "albumName": dashcamAlbumName,
                        "mode": value.mode.rawValue,
                        "hasAudio": false,
                        "warning": dashcamAudioWarning,
                    ]
                    if let assetIdentifier = value.assetIdentifier {
                        payload["assetIdentifier"] = assetIdentifier
                    }
                    if let error = value.error {
                        payload["error"] = error
                    }
                    call.resolve(payload)
                }
            }
        }
    }
}
