// Entities of the Batch 5 admin console pages (phone fixes, cache stats,
// membership applications). Shapes follow the backend responses.

String? _s(Object? v) => v?.toString();

/// One stored number the E.164 migration could not convert.
class PhoneFix {
  const PhoneFix({
    required this.id,
    required this.entityType,
    required this.field,
    required this.rawValue,
    this.memberCode,
    this.memberName,
  });

  factory PhoneFix.fromJson(Map<dynamic, dynamic> j) => PhoneFix(
        id: (j['id'] as num).toInt(),
        entityType: _s(j['entity_type']) ?? '',
        field: _s(j['field']) ?? '',
        rawValue: _s(j['raw_value']) ?? '',
        memberCode: _s(j['member_code']),
        memberName: _s(j['member_name']),
      );

  final int id;
  final String entityType;
  final String field;
  final String rawValue;
  final String? memberCode;
  final String? memberName;
}

class CacheStat {
  const CacheStat({
    required this.name,
    required this.size,
    required this.maxSize,
    required this.ttlSeconds,
    required this.hitRatio,
    required this.invalidations,
  });

  factory CacheStat.fromJson(Map<dynamic, dynamic> j) => CacheStat(
        name: _s(j['name']) ?? '',
        size: (j['size'] as num?)?.toInt() ?? 0,
        maxSize: (j['maxsize'] as num?)?.toInt() ?? 0,
        ttlSeconds: (j['ttl_seconds'] as num?)?.toInt() ?? 0,
        hitRatio: (j['hit_ratio'] as num?)?.toDouble() ?? 0,
        invalidations: (j['invalidations'] as num?)?.toInt() ?? 0,
      );

  final String name;
  final int size;
  final int maxSize;
  final int ttlSeconds;
  final double hitRatio;
  final int invalidations;
}

class CacheStats {
  const CacheStats({required this.enabled, required this.caches});

  factory CacheStats.fromJson(Map<dynamic, dynamic> j) => CacheStats(
        enabled: j['enabled'] == true,
        caches: [for (final c in (j['caches'] as List? ?? const []).whereType<Map>()) CacheStat.fromJson(c)],
      );

  final bool enabled;
  final List<CacheStat> caches;
}

/// One row of GET /admin/membership-applications.
class MembershipApplication {
  const MembershipApplication({
    required this.id,
    required this.applicationNo,
    required this.fullName,
    required this.mobile,
    required this.status,
    required this.submittedAt,
    required this.slaState,
    required this.slaDaysRemaining,
    required this.rejectionReason,
  });

  factory MembershipApplication.fromJson(Map<dynamic, dynamic> j) {
    final sla = j['sla'];
    return MembershipApplication(
      id: (j['id'] as num).toInt(),
      applicationNo: _s(j['application_no']) ?? '',
      fullName: _s(j['full_name']) ?? '',
      mobile: _s(j['mobile']) ?? '',
      status: _s(j['status']) ?? 'received',
      submittedAt: _s(j['submitted_at']) ?? '',
      slaState: sla is Map ? _s(sla['state']) : null,
      slaDaysRemaining: sla is Map ? (sla['days_remaining'] as num?)?.toInt() : null,
      rejectionReason: _s(j['rejection_reason']),
    );
  }

  final int id;
  final String applicationNo;
  final String fullName;
  final String mobile;

  /// received / under_review / approved / rejected.
  final String status;
  final String submittedAt;
  final String? slaState;
  final int? slaDaysRemaining;
  final String? rejectionReason;

  bool get isOpen => status == 'received' || status == 'under_review';
}
