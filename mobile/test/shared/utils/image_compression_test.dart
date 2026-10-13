import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:kaundia_app/shared/utils/image_compression.dart';

class FakeCompressor implements ImageCompressor {
  FakeCompressor(this.sizesByQuality);
  final Map<int, int> sizesByQuality;
  final List<int> qualities = [];
  int? lastMaxDimension;
  bool returnNull = false;
  bool throwError = false;

  @override
  Future<File?> compress(
    File source,
    String targetPath, {
    required int quality,
    required int maxDimension,
  }) async {
    qualities.add(quality);
    lastMaxDimension = maxDimension;
    if (throwError) throw StateError('native failure');
    if (returnNull) return null;
    final f = File(targetPath);
    await f.writeAsBytes(List.filled(sizesByQuality[quality] ?? 1, 7));
    return f;
  }
}

void main() {
  late Directory dir;
  setUp(() => dir = Directory.systemTemp.createTempSync('compress_test'));
  tearDown(() => dir.deleteSync(recursive: true));

  File make(String name, int bytes) {
    final f = File('${dir.path}/$name');
    f.writeAsBytesSync(List.filled(bytes, 1));
    return f;
  }

  group('fitWithin', () {
    test('landscape larger than max scales long side', () {
      expect(fitWithin(4000, 3000, 1600), (1600, 1200));
    });
    test('portrait', () => expect(fitWithin(3000, 4000, 1600), (1200, 1600)));
    test('already small is unchanged', () => expect(fitWithin(800, 600, 1600), (800, 600)));
    test('never returns zero', () => expect(fitWithin(10000, 1, 100), (100, 1)));
  });

  group('compressForUpload', () {
    test('PDF is returned untouched, even when big', () async {
      final pdf = make('doc.PDF', 3000000);
      final c = FakeCompressor({});
      final out = await compressForUpload(pdf, compressor: c);
      expect(out.path, pdf.path);
      expect(c.qualities, isEmpty);
    });

    test('non-image extension is returned untouched', () async {
      final f = make('notes.txt', 3000000);
      final c = FakeCompressor({});
      expect((await compressForUpload(f, compressor: c)).path, f.path);
      expect(c.qualities, isEmpty);
    });

    test('image already under maxBytes is skipped', () async {
      final f = make('small.jpg', 900000);
      final c = FakeCompressor({});
      expect((await compressForUpload(f, compressor: c)).path, f.path);
      expect(c.qualities, isEmpty);
    });

    test('big image compressed once when result fits; passes maxDimension', () async {
      final f = make('big.jpg', 3000000);
      final c = FakeCompressor({85: 400000});
      final out = await compressForUpload(f, compressor: c, maxDimension: 1200);
      expect(out.path, isNot(f.path));
      expect(out.path.toLowerCase(), endsWith('.jpg'));
      expect(out.lengthSync(), 400000);
      expect(c.qualities, [85]);
      expect(c.lastMaxDimension, 1200);
    });

    test('steps quality down until under maxBytes', () async {
      final f = make('photo.png', 3000000);
      final c = FakeCompressor({85: 2000000, 70: 1500000, 55: 900000});
      final out = await compressForUpload(f, compressor: c);
      expect(c.qualities, [85, 70, 55]);
      expect(out.lengthSync(), 900000);
    });

    test('returns smallest attempt when none fit', () async {
      final f = make('huge.jpeg', 5000000);
      final c = FakeCompressor({85: 4000000, 70: 3000000, 55: 2500000, 40: 2000000});
      final out = await compressForUpload(f, compressor: c);
      expect(c.qualities, [85, 70, 55, 40]);
      expect(out.lengthSync(), 2000000);
    });

    test('keeps original when compression would make it bigger', () async {
      final f = make('odd.jpg', 1100000);
      final c = FakeCompressor({85: 1500000, 70: 1400000, 55: 1300000, 40: 1200000});
      expect((await compressForUpload(f, compressor: c)).path, f.path);
    });

    test('falls back to original when compressor returns null or throws', () async {
      final f = make('x.jpg', 2000000);
      final nullC = FakeCompressor({})..returnNull = true;
      expect((await compressForUpload(f, compressor: nullC)).path, f.path);
      final errC = FakeCompressor({})..throwError = true;
      expect((await compressForUpload(f, compressor: errC)).path, f.path);
    });

    test('custom maxBytes is respected', () async {
      final f = make('mid.jpg', 600000);
      final c = FakeCompressor({85: 300000});
      final out = await compressForUpload(f, compressor: c, maxBytes: 500000);
      expect(out.lengthSync(), 300000);
    });

    test('original file is never deleted', () async {
      final f = make('keep.jpg', 3000000);
      await compressForUpload(f, compressor: FakeCompressor({85: 100}));
      expect(f.existsSync(), isTrue);
    });
  });
}
