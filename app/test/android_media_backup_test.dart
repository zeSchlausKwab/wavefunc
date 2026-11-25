import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:wavefunc_app/data/services/rust_bridge_backend.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'Android backup surfaces local download errors and removes partial files',
    () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      final cache = await Directory.systemTemp.createTemp('wavefunc-backup-');
      addTearDown(() => cache.delete(recursive: true));
      const channel = MethodChannel('live.wavefunc.app/media');
      final messenger =
          TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
      addTearDown(() => messenger.setMockMethodCallHandler(channel, null));
      late Directory job;
      messenger.setMockMethodCallHandler(channel, (call) async {
        expect(call.method, 'prepareDownload');
        expect(call.arguments['videoId'], 'xAvT4GcD9vs');
        expect(call.arguments['format'], '720p');
        job = Directory(call.arguments['directory'] as String);
        expect(job.parent.path, '${cache.path}/media-jobs');
        await File('${job.path}/video.part').writeAsBytes([1, 2, 3]);
        throw PlatformException(
          code: 'DOWNLOAD_FAILED',
          message: 'Unavailable',
        );
      });

      await expectLater(
        RustBridgeBackend().prepareYouTubeMedia(
          cacheRoot: cache.path,
          videoId: 'xAvT4GcD9vs',
          format: '720p',
        ),
        throwsA(
          isA<PlatformException>().having(
            (error) => error.message,
            'local error',
            'Unavailable',
          ),
        ),
      );
      expect(await job.exists(), isFalse);
    },
  );
}
