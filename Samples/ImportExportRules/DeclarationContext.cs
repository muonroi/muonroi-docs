using System;
namespace ImportExportRules;

/// <summary>
/// Context for creating import/export declarations.
/// </summary>
/// <param name="UserId">Identifier of the requesting user.</param>
/// <param name="GoodsType">Type of goods in the declaration.</param>
public sealed record DeclarationContext(string UserId, string GoodsType);
