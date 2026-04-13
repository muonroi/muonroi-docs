namespace Samples.PaymentApproval;

/// <summary>
/// Context information for a payment approval request.
/// </summary>
/// <param name="CreatorId">Identifier of the creator requesting payment.</param>
/// <param name="Amount">Requested amount.</param>
public sealed record PaymentApprovalContext(string CreatorId, decimal Amount);
