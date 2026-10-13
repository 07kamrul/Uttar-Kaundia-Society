import '../../../core/network/api_client.dart';

/// One of the society's accounts members pay into (bKash, Nagad, bank...).
class PaymentAccount {
  const PaymentAccount({
    required this.method,
    required this.label,
    this.number = '',
    this.accountName = '',
  });

  /// Canonical method key (`bkash`, `nagad`, `rocket`, `bank`, ...).
  final String method;
  /// Human-readable details text (bank, branch, number...).
  final String label;

  /// First digit run of the details, empty when none (nothing to copy).
  final String number;
  final String accountName;
}

/// GET /public/registration-config (no auth): current consent version and the
/// society's payment accounts, shared with the member pay-dues dialog.
class RegistrationConfig {
  const RegistrationConfig({this.consentVersion = '', this.paymentAccounts = const []});

  static const empty = RegistrationConfig();

  final String consentVersion;
  final List<PaymentAccount> paymentAccounts;

  /// Accounts configured for [method], in server order.
  List<PaymentAccount> accountsFor(String method) =>
      [for (final a in paymentAccounts) if (a.method == method) a];

  factory RegistrationConfig.fromJson(Object? raw) {
    if (raw is! Map) return empty;
    final accounts = raw['payment_accounts'];
    return RegistrationConfig(
      consentVersion: (raw['consent_version'] ?? '').toString(),
      paymentAccounts: [
        if (accounts is List)
          for (final a in accounts)
            if (a is Map)
              PaymentAccount(
                method: (a['method'] ?? '').toString(),
                label: (a['label'] ?? '').toString(),
                number: (a['number'] ?? '').toString(),
                accountName: (a['account_name'] ?? '').toString(),
              ),
      ],
    );
  }
}

class RegistrationConfigRepository {
  RegistrationConfigRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  /// Never throws: the form works without the config (no account cards, the
  /// server then stores its current consent version).
  Future<RegistrationConfig> load() async {
    try {
      return RegistrationConfig.fromJson(await _apiClient.getUri('/public/registration-config'));
    } catch (_) {
      return RegistrationConfig.empty;
    }
  }
}
