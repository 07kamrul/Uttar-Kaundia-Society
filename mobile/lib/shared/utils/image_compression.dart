import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';

/// Pre-upload image shrinking built on the existing `flutter_image_compress`
/// dependency (no new packages). PDFs and other non-image files pass through.

const _imageExtensions = {'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'};
const _qualitySteps = [85, 70, 55, 40];

/// Scales (width, height) so the long side is at most [maxDimension],
/// preserving aspect ratio. Never enlarges and never returns zero.
(int, int) fitWithin(int width, int height, int maxDimension) {
  final longSide = width > height ? width : height;
  if (longSide <= maxDimension) return (width, height);
  final scale = maxDimension / longSide;
  int scaled(int v) => (v * scale).round().clamp(1, maxDimension);
  return (scaled(width), scaled(height));
}

/// Seam over the native compressor so the retry logic is unit-testable.
abstract class ImageCompressor {
  /// Writes a JPEG to [targetPath]; returns null if the platform failed.
  Future<File?> compress(
    File source,
    String targetPath, {
    required int quality,
    required int maxDimension,
  });
}

class NativeImageCompressor implements ImageCompressor {
  const NativeImageCompressor();

  @override
  Future<File?> compress(
    File source,
    String targetPath, {
    required int quality,
    required int maxDimension,
  }) async {
    var minWidth = maxDimension;
    var minHeight = maxDimension;
    try {
      // The plugin scales so the SHORT side reaches minWidth/minHeight; derive
      // target sizes from the real dimensions so the LONG side is capped instead.
      final buffer = await ui.ImmutableBuffer.fromUint8List(await source.readAsBytes());
      final descriptor = await ui.ImageDescriptor.encoded(buffer);
      (minWidth, minHeight) = fitWithin(descriptor.width, descriptor.height, maxDimension);
      descriptor.dispose();
      buffer.dispose();
    } catch (e) {
      debugPrint('Could not read image size, using square bound: $e');
    }
    final result = await FlutterImageCompress.compressAndGetFile(
      source.path,
      targetPath,
      quality: quality,
      minWidth: minWidth,
      minHeight: minHeight,
      format: CompressFormat.jpeg,
    );
    return result == null ? null : File(result.path);
  }
}

bool _isCompressibleImage(String path) {
  final dot = path.lastIndexOf('.');
  if (dot < 0) return false;
  return _imageExtensions.contains(path.substring(dot + 1).toLowerCase());
}

/// Returns a file small enough to upload. Files at or under [maxBytes], PDFs
/// and other non-images are returned unchanged. Otherwise the image is
/// downscaled to [maxDimension] and re-encoded as JPEG at decreasing quality
/// until it fits; if nothing fits the smallest result is returned. Any failure
/// (or a result larger than the original) falls back to the original file.
/// The original is never deleted.
Future<File> compressForUpload(
  File file, {
  int maxBytes = 1000000,
  int maxDimension = 1600,
  ImageCompressor compressor = const NativeImageCompressor(),
}) async {
  if (!_isCompressibleImage(file.path)) return file;
  final originalSize = await file.length();
  if (originalSize <= maxBytes) return file;

  File? best;
  try {
    final tempDir = await Directory.systemTemp.createTemp('upload_');
    for (final quality in _qualitySteps) {
      final attempt = await compressor.compress(
        file,
        '${tempDir.path}${Platform.pathSeparator}q$quality.jpg',
        quality: quality,
        maxDimension: maxDimension,
      );
      if (attempt == null) break;
      final size = await attempt.length();
      if (best == null || size < await best.length()) {
        best = attempt;
      }
      if (size <= maxBytes) break;
    }
  } catch (e) {
    debugPrint('Image compression failed, uploading original: $e');
    return file;
  }

  if (best == null || await best.length() >= originalSize) return file;
  return best;
}
