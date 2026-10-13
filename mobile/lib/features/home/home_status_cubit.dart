import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/enums/enums.dart';
import '../member/data/member_repository.dart';
import '../member/data/payments_repository.dart';
import '../member/domain/member_entities.dart';
import '../member/domain/merged_payment_entities.dart';
import '../public_content/data/content_repository.dart';
import '../public_content/domain/content_entities.dart';

enum CardStatus { loading, loaded, error }

/// One independently loading card: skeleton, data or a retryable error.
class AsyncCard<T> extends Equatable {
  const AsyncCard.loading()
      : status = CardStatus.loading,
        data = null,
        error = null;
  const AsyncCard.loaded(T this.data)
      : status = CardStatus.loaded,
        error = null;
  const AsyncCard.error(Object this.error)
      : status = CardStatus.error,
        data = null;

  final CardStatus status;
  final T? data;
  final Object? error;

  bool get isLoading => status == CardStatus.loading;
  bool get isLoaded => status == CardStatus.loaded;

  @override
  List<Object?> get props => [status, data, error];
}

enum HomeNextStep { loading, pending, needsDag, dues, allGood }

class HomeState extends Equatable {
  const HomeState({
    this.profile = const AsyncCard.loading(),
    this.dues = const AsyncCard.loading(),
    this.notice = const AsyncCard.loading(),
    this.event = const AsyncCard.loading(),
  });

  final AsyncCard<MemberProfile> profile;
  final AsyncCard<PaymentSummary> dues;
  final AsyncCard<Notice?> notice;
  final AsyncCard<EventItem?> event;

  /// A property exists but has neither CS nor RS dag number: the office has to
  /// record it. (Mirrors the backend `needs_dag` flag, which members' own
  /// profile does not expose.)
  static bool needsDag(MemberProfile p) => p.properties.any(
        (x) => (x.dagNoCs ?? '').trim().isEmpty && (x.dagNoRs ?? '').trim().isEmpty,
      );

  /// pending, then needs-dag, then dues, otherwise all in order. A card that
  /// failed to load is skipped rather than blocking the rest.
  HomeNextStep get nextStep {
    if (profile.isLoading || dues.isLoading) return HomeNextStep.loading;
    final p = profile.data;
    if (p != null) {
      if (p.memberStatus == MemberStatus.pending) return HomeNextStep.pending;
      if (needsDag(p)) return HomeNextStep.needsDag;
    }
    final d = dues.data;
    if (d != null && d.totalDue > 0) return HomeNextStep.dues;
    return HomeNextStep.allGood;
  }

  HomeState copyWith({
    AsyncCard<MemberProfile>? profile,
    AsyncCard<PaymentSummary>? dues,
    AsyncCard<Notice?>? notice,
    AsyncCard<EventItem?>? event,
  }) =>
      HomeState(
        profile: profile ?? this.profile,
        dues: dues ?? this.dues,
        notice: notice ?? this.notice,
        event: event ?? this.event,
      );

  @override
  List<Object?> get props => [profile, dues, notice, event];
}

/// "আমার অবস্থা" home: four cards, each loaded on its own.
class HomeStatusCubit extends Cubit<HomeState> {
  HomeStatusCubit({
    required MemberRepository memberRepository,
    required PaymentsRepository paymentsRepository,
    required ContentRepository contentRepository,
    required bool mergedPayments,
    DateTime Function()? now,
  })  : _member = memberRepository,
        _payments = paymentsRepository,
        _content = contentRepository,
        _merged = mergedPayments,
        _now = now ?? DateTime.now,
        super(const HomeState());

  final MemberRepository _member;
  final PaymentsRepository _payments;
  final ContentRepository _content;
  final bool _merged;
  final DateTime Function() _now;

  Future<void> load() => Future.wait([loadProfile(), loadDues(), loadNotice(), loadEvent()]);

  Future<void> loadProfile() async {
    emit(state.copyWith(profile: const AsyncCard.loading()));
    try {
      emit(state.copyWith(profile: AsyncCard.loaded(await _member.getProfile())));
    } catch (e) {
      emit(state.copyWith(profile: AsyncCard.error(e)));
    }
  }

  Future<void> loadDues() async {
    emit(state.copyWith(dues: const AsyncCard.loading()));
    try {
      final summary = _merged ? await _payments.summary() : await _payments.legacySummary();
      emit(state.copyWith(dues: AsyncCard.loaded(summary)));
    } catch (e) {
      emit(state.copyWith(dues: AsyncCard.error(e)));
    }
  }

  Future<void> loadNotice() async {
    emit(state.copyWith(notice: const AsyncCard.loading()));
    try {
      final notices = [...await _content.listNotices()]
        ..sort((a, b) => (b.publishAt ?? b.createdAt).compareTo(a.publishAt ?? a.createdAt));
      emit(state.copyWith(notice: AsyncCard.loaded(notices.isEmpty ? null : notices.first)));
    } catch (e) {
      emit(state.copyWith(notice: AsyncCard.error(e)));
    }
  }

  Future<void> loadEvent() async {
    emit(state.copyWith(event: const AsyncCard.loading()));
    try {
      final now = _now().toUtc();
      final upcoming = [
        for (final e in await _content.listEvents())
          if (DateTime.tryParse(e.startAt) case final start? when !start.toUtc().isBefore(now)) (start, e),
      ]..sort((a, b) => a.$1.compareTo(b.$1));
      emit(state.copyWith(event: AsyncCard.loaded(upcoming.isEmpty ? null : upcoming.first.$2)));
    } catch (e) {
      emit(state.copyWith(event: AsyncCard.error(e)));
    }
  }
}
