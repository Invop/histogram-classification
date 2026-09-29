using System.Numerics.Tensors;
using HistogramClassification.Core.Features;
using HistogramClassification.Core.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace HistogramClassification.Core.Network;

public sealed record ClassOutput(string ClassName, float Value);

public sealed record RecognitionResult(string Predicted, IReadOnlyList<ClassOutput> Outputs, int[] Histogram, int[] Partial);

public static class Recognizer
{
    public static RecognitionResult Recognize(TrainedModel model, Stream stream)
    {
        using var image = Image.Load<Rgb24>(stream);
        return Recognize(model, image);
    }

    public static RecognitionResult Recognize(TrainedModel model, Image<Rgb24> image)
    {
        var histogram = LumaHistogram.Compute(image);
        var partial = PartialHistogram.Quantize(histogram);
        var outputs = model.Network.Predict(PartialHistogram.Encode(partial));
        return new RecognitionResult(
            model.ClassNames[TensorPrimitives.IndexOfMax(outputs)],
            [.. outputs.Select((value, k) => new ClassOutput(model.ClassNames[k], value))],
            histogram,
            partial);
    }
}
