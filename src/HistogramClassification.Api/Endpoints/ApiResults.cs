namespace HistogramClassification.Api.Endpoints;

internal static class ApiResults
{
    public static IResult BadRequest(string detail) => Results.Problem(detail, statusCode: StatusCodes.Status400BadRequest);

    public static IResult Busy() =>
        Results.Problem("Уже виконується інша операція. Дочекайтесь завершення або скасуйте її.", statusCode: StatusCodes.Status409Conflict);

    public static IResult NoModel() =>
        Results.Problem("Модель ще не навчена.", statusCode: StatusCodes.Status404NotFound);

    public static IResult Accepted(Guid jobId) => Results.Accepted(value: new { jobId });
}
