using PhoneToPcSpeaker.WindowsBridge.Models;

namespace PhoneToPcSpeaker.WindowsBridge.Diagnostics;

public sealed class BridgeDiagnostics
{
    private readonly object _syncRoot = new();
    private readonly List<SummaryDiagnosticEntryModel> _summary = [];
    private readonly List<AdvancedDiagnosticEntryModel> _advanced = [];

    public event Action<DiagnosticsEventModel>? Appended;

    public DiagnosticsEventModel Info(
        string title,
        string? detail,
        string source = DiagnosticsSources.WindowsBridge,
        string category = DiagnosticsCategories.General,
        string? summaryDetail = null,
        string? advancedLabel = null)
    {
        return Append(DiagnosticsSeverities.Info, source, category, title, detail, summaryDetail, advancedLabel);
    }

    public DiagnosticsEventModel Warning(
        string title,
        string? detail,
        string source = DiagnosticsSources.WindowsBridge,
        string category = DiagnosticsCategories.General,
        string? summaryDetail = null,
        string? advancedLabel = null)
    {
        return Append(DiagnosticsSeverities.Warning, source, category, title, detail, summaryDetail, advancedLabel);
    }

    public DiagnosticsEventModel Error(
        string title,
        string? detail,
        string source = DiagnosticsSources.WindowsBridge,
        string category = DiagnosticsCategories.General,
        string? summaryDetail = null,
        string? advancedLabel = null)
    {
        return Append(DiagnosticsSeverities.Error, source, category, title, detail, summaryDetail, advancedLabel);
    }

    public DiagnosticsSnapshotModel GetRecent(int? limit)
    {
        lock (_syncRoot)
        {
            int effectiveLimit = limit is null || limit <= 0 ? _summary.Count : limit.Value;
            List<SummaryDiagnosticEntryModel> summaryEntries = _summary.TakeLast(effectiveLimit).ToList();
            HashSet<string> allowedSummaryIds = summaryEntries.Select((entry) => entry.Id).ToHashSet(StringComparer.Ordinal);
            List<AdvancedDiagnosticEntryModel> advancedEntries = _advanced
                .Where((entry) => allowedSummaryIds.Contains(entry.SummaryId))
                .ToList();

            return new DiagnosticsSnapshotModel
            {
                Summary = summaryEntries,
                Advanced = advancedEntries
            };
        }
    }

    private DiagnosticsEventModel Append(
        string severity,
        string source,
        string category,
        string title,
        string? detail,
        string? summaryDetail,
        string? advancedLabel)
    {
        string timestamp = DateTimeOffset.UtcNow.ToString("O");
        string summaryId = Guid.NewGuid().ToString("D");
        SummaryDiagnosticEntryModel summaryEntry = new()
        {
            Id = summaryId,
            Timestamp = timestamp,
            Severity = severity,
            Source = source,
            Title = title,
            Detail = summaryDetail ?? BuildSummaryDetail(detail, category)
        };

        AdvancedDiagnosticEntryModel? advancedEntry = string.IsNullOrWhiteSpace(detail)
            ? null
            : new AdvancedDiagnosticEntryModel
            {
                Id = Guid.NewGuid().ToString("D"),
                SummaryId = summaryId,
                Timestamp = timestamp,
                Severity = severity,
                Source = source,
                Category = category,
                Label = advancedLabel ?? BuildAdvancedLabel(category),
                Detail = detail
            };

        lock (_syncRoot)
        {
            _summary.Add(summaryEntry);
            if (advancedEntry is not null)
            {
                _advanced.Add(advancedEntry);
            }

            TrimBuffer(_summary);
            TrimBuffer(_advanced);
        }

        Console.Error.WriteLine($"[{timestamp}] {severity.ToUpperInvariant()} {source} {title} :: {detail}");

        DiagnosticsEventModel diagnosticsEvent = new()
        {
            Summary = summaryEntry,
            Advanced = advancedEntry
        };

        Appended?.Invoke(diagnosticsEvent);
        return diagnosticsEvent;
    }

    private static string? BuildSummaryDetail(string? detail, string category)
    {
        if (string.IsNullOrWhiteSpace(detail))
        {
            return null;
        }

        return category switch
        {
            DiagnosticsCategories.DeviceIdentifier => "Identifier moved to advanced diagnostics.",
            _ => Truncate(detail.Replace(Environment.NewLine, " "), 140)
        };
    }

    private static string BuildAdvancedLabel(string category)
    {
        return category switch
        {
            DiagnosticsCategories.BridgeLog => "Bridge log",
            DiagnosticsCategories.NativeDetail => "Native detail",
            DiagnosticsCategories.DeviceIdentifier => "Device identifier",
            DiagnosticsCategories.CapabilityProbe => "Capability probe",
            DiagnosticsCategories.TechnicalContext => "Technical context",
            _ => "Advanced detail"
        };
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        return string.Concat(value.AsSpan(0, maxLength - 1), "…");
    }

    private static void TrimBuffer<TEntry>(List<TEntry> entries)
    {
        if (entries.Count > 200)
        {
            entries.RemoveRange(0, entries.Count - 200);
        }
    }
}
