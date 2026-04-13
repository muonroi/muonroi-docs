namespace Samples.PaymentApproval;

/// <summary>
/// Represents workflow configuration details returned from BPMN system.
/// </summary>
public sealed record WorkflowInfo(bool Configured, bool Locked);
