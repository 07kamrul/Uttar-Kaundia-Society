/// Module 7 registers: society assets and welfare activities.
/// Mirrors Angular registers.service.ts.
library;

const assetConditions = ['good', 'fair', 'poor', 'lost'];
const welfareActivityTypes = ['training', 'welfare', 'other'];

class SocietyAsset {
  const SocietyAsset({
    required this.id,
    required this.assetCode,
    required this.name,
    required this.category,
    required this.acquisitionDate,
    required this.value,
    required this.condition,
    required this.isActive,
    this.description,
    this.location,
    this.notes,
  });

  final int id;
  final String assetCode;
  final String name;
  final String? description;
  final String category;
  final String acquisitionDate;
  final num value;
  final String condition;
  final String? location;
  final String? notes;
  final bool isActive;
}

class AssetInput {
  const AssetInput({
    required this.name,
    required this.category,
    required this.acquisitionDate,
    required this.value,
    required this.condition,
    this.location,
    this.description,
  });

  final String name;
  final String category;
  final String acquisitionDate;
  final num value;
  final String condition;
  final String? location;
  final String? description;

  Map<String, dynamic> toJson() => {
        'name': name,
        'description': description,
        'category': category,
        'acquisition_date': acquisitionDate,
        'value': value,
        'condition': condition,
        'location': location,
      };
}

class AssetFilter {
  const AssetFilter({this.search = '', this.includeInactive = false});

  final String search;
  final bool includeInactive;
}

class WelfareActivity {
  const WelfareActivity({
    required this.id,
    required this.activityDate,
    required this.title,
    required this.activityType,
    required this.participantsCount,
    this.participantNotes,
    this.outcome,
    this.organizer,
    this.notes,
  });

  final int id;
  final String activityDate;
  final String title;
  final String activityType;
  final int participantsCount;
  final String? participantNotes;
  final String? outcome;
  final String? organizer;
  final String? notes;
}

class ActivityInput {
  const ActivityInput({
    required this.activityDate,
    required this.title,
    required this.activityType,
    required this.participantsCount,
    this.organizer,
    this.outcome,
  });

  final String activityDate;
  final String title;
  final String activityType;
  final int participantsCount;
  final String? organizer;
  final String? outcome;

  Map<String, dynamic> toJson() => {
        'activity_date': activityDate,
        'title': title,
        'activity_type': activityType,
        'participants_count': participantsCount,
        'organizer': organizer,
        'outcome': outcome,
      };
}
