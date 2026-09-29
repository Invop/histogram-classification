using System.Text.Json;
using HistogramClassification.Core.Features;

namespace HistogramClassification.Core.Network;

/// <summary>JSON-формат моделі: класи, параметри ознак, ваги, зсуви, метадані.</summary>
public static class ModelSerializer
{
    public const int FormatVersion = 1;
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    internal sealed record ModelDto(
        int FormatVersion, int Inputs, int Levels, string[] Classes, float[][] Weights, float[] Biases, ModelMetadata Metadata);

    public static string Serialize(TrainedModel model) => JsonSerializer.Serialize(new ModelDto(
        FormatVersion, model.Network.Inputs, PartialHistogram.Levels, [.. model.ClassNames],
        model.Network.Weights, model.Network.Biases, model.Metadata), Options);

    public static TrainedModel Deserialize(string json)
    {
        ModelDto dto;
        try
        {
            dto = JsonSerializer.Deserialize<ModelDto>(json, Options) ?? throw new InvalidDataException("Порожній файл моделі.");
        }
        catch (JsonException e)
        {
            throw new InvalidDataException("Файл моделі не є коректним JSON.", e);
        }

        if (dto.FormatVersion != FormatVersion)
            throw new InvalidDataException($"Непідтримувана версія формату моделі: {dto.FormatVersion}.");
        if (dto.Inputs != PartialHistogram.FeatureLength || dto.Levels != PartialHistogram.Levels)
            throw new InvalidDataException(
                $"Модель має {dto.Inputs} входів і {dto.Levels} рівнів, очікувалось {PartialHistogram.FeatureLength} і {PartialHistogram.Levels}.");
        if (dto.Classes is not { Length: >= 2 } || dto.Weights is null || dto.Biases is null || dto.Metadata is null ||
            dto.Weights.Length != dto.Classes.Length || dto.Weights.Any(row => row?.Length != dto.Inputs))
            throw new InvalidDataException("Кількість класів не збігається з розмірами матриці ваг.");

        try
        {
            return new TrainedModel(dto.Classes, new SingleLayerPerceptron(dto.Weights, dto.Biases), dto.Metadata);
        }
        catch (ArgumentException e)
        {
            throw new InvalidDataException(e.Message, e);
        }
    }
}
