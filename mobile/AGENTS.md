# Mobile — Flutter port of the Angular frontend

Read root `AGENTS.md` first. **Read `CONVENTIONS.md` before writing any feature code.**
`ANGULAR_SOURCE_OF_TRUTH.md` maps each screen to its Angular source — port behavior,
fields, validation and states from there; do not change backend contracts.

## Layout

- `lib/core/` — config, `ApiClient` (dio) + error mapping, auth/session + permissions,
  router guards, theme, nav config, DI (`get_it`, `sl<T>()`).
- `lib/shared/` — design-system widgets ported from Angular primitives; file utils.
- `lib/features/<area>/{data,domain,presentation}/` — DTOs/mappers → BLoC → pages.

## Commands

```bash
flutter pub get
flutter gen-l10n
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8000/api --dart-define=APP_FLAVOR=dev
flutter analyze   # must be clean
flutter test      # must be green
```

## Hard rules (from CONVENTIONS.md)

- No API calls or business logic in widgets — widgets read state, dispatch events.
- Enums for string variants (`lib/core/enums/enums.dart`); never scatter raw status strings.
- Hand-written mappers (`toEntity()` / `toDto()` extensions); `json_serializable` for DTOs only.
- All user-visible strings in BOTH `lib/l10n/app_bn.arb` (template) and `app_en.arb`,
  then run `flutter gen-l10n`. Bangla default.
