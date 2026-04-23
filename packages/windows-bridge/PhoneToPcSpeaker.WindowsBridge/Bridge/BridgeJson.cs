using System.Text.Json;
using System.Text.Json.Serialization;

namespace PhoneToPcSpeaker.WindowsBridge.Bridge;

public static class BridgeJson
{
    public static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = false
    };
}
