import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

enum NetStatus { online, offline, slow, reconnected }

/// What the API client reports about each request.
abstract interface class NetworkObserver {
  void requestStarted(Object token);
  void requestSucceeded(Object token);

  /// [offline] is true for connection errors / timeouts (no answer from the
  /// server); an HTTP error status still means the network works.
  void requestFailed(Object token, {required bool offline});
}

/// Offline / slow / back-online state for the net_status_banner. A request
/// still open after [slowAfter] makes it "slow"; the first success after
/// being offline shows "reconnected" for [reconnectedFor].
class NetworkStatusCubit extends Cubit<NetStatus> implements NetworkObserver {
  NetworkStatusCubit({
    this.slowAfter = const Duration(seconds: 8),
    this.reconnectedFor = const Duration(seconds: 3),
  }) : super(NetStatus.online);

  final Duration slowAfter;
  final Duration reconnectedFor;

  final _slowTimers = <Object, Timer>{};
  Timer? _reconnectTimer;

  @override
  void requestStarted(Object token) {
    _slowTimers[token]?.cancel();
    _slowTimers[token] = Timer(slowAfter, () {
      _slowTimers.remove(token);
      if (state == NetStatus.online || state == NetStatus.reconnected) {
        _reconnectTimer?.cancel();
        emit(NetStatus.slow);
      }
    });
  }

  @override
  void requestSucceeded(Object token) {
    _slowTimers.remove(token)?.cancel();
    _backOnline();
  }

  @override
  void requestFailed(Object token, {required bool offline}) {
    _slowTimers.remove(token)?.cancel();
    if (offline) {
      _reconnectTimer?.cancel();
      if (state != NetStatus.offline) emit(NetStatus.offline);
    } else {
      _backOnline();
    }
  }

  void _backOnline() {
    switch (state) {
      case NetStatus.offline:
        emit(NetStatus.reconnected);
        _reconnectTimer?.cancel();
        _reconnectTimer = Timer(reconnectedFor, () {
          if (!isClosed && state == NetStatus.reconnected) emit(NetStatus.online);
        });
      case NetStatus.slow:
        emit(NetStatus.online);
      case NetStatus.online:
      case NetStatus.reconnected:
        break;
    }
  }

  @override
  Future<void> close() {
    for (final t in _slowTimers.values) {
      t.cancel();
    }
    _slowTimers.clear();
    _reconnectTimer?.cancel();
    return super.close();
  }
}
