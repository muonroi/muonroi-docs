---
title: Python SDK
sidebar_label: Python SDK
sidebar_position: 7
---

# Experience Engine Python SDK

The Experience Engine Python SDK provides programmatic access to the Experience Engine API for querying warnings, extracting lessons, and managing knowledge evolution.

## Installation

Install the SDK with zero dependencies using Python's standard library:

```bash
pip install muonroi-experience
```

**Requirements:** Python 3.8 or later. No external dependencies — uses only stdlib `urllib`.

## Quick Start

```python
from muonroi_experience import Client

# Initialize client
client = Client("http://localhost:8082")

# Query for warnings before a tool call
result = client.intercept("Write", {"file_path": "app.py"})
if result["hasSuggestions"]:
    print(result["suggestions"])

# Extract lessons from a session transcript
client.extract("Agent tried singleton for DbContext, caused state corruption...")

# Trigger evolution cycle
evolution = client.evolve()
print(f"Promoted: {evolution['promoted']}, Abstracted: {evolution['abstracted']}")

# View knowledge evolution timeline
timeline = client.timeline("dependency injection")
for entry in timeline["timeline"]:
    status = '[superseded]' if entry['superseded'] else ''
    print(f"  {status} {entry['solution']}")
```

## Authentication

For remote VPS or authenticated instances:

```python
from muonroi_experience import Client

client = Client(
    "http://your-vps:8082",
    token="YOUR_TOKEN"
)
```

## Client API Reference

### intercept(tool_name, tool_input)

Query for experience-based warnings before executing a tool.

**Parameters:**
- `tool_name` (str): Name of the tool being called (e.g., "Write", "Edit", "Bash")
- `tool_input` (dict): Tool input parameters

**Returns:** dict with `hasSuggestions` (bool) and optional `suggestions` (str)

**Example:**
```python
result = client.intercept("Edit", {
    "file_path": "/path/to/file.py",
    "old_string": "foo = bar",
    "new_string": "foo = baz"
})

if result["hasSuggestions"]:
    print(result["suggestions"])
    # Output: ⚠️ [Experience - High Confidence (0.92)]: ...
```

### posttool(tool_name, tool_input, outcome)

Report the outcome of a tool call for post-tool reconciliation.

**Parameters:**
- `tool_name` (str): Name of the tool that was executed
- `tool_input` (dict): Original tool input parameters
- `outcome` (dict): Execution outcome with keys like `success`, `error`, `output`

**Returns:** dict with reconciliation results

**Example:**
```python
outcome = client.posttool(
    "Bash",
    {"command": "npm test"},
    {
        "success": True,
        "output": "All tests passed"
    }
)
```

### extract(transcript)

Extract lessons and patterns from a session transcript or conversation.

**Parameters:**
- `transcript` (str): Session transcript or raw conversation text

**Returns:** dict with extracted lessons and patterns

**Example:**
```python
transcript = """
Agent: I implemented caching with a singleton pattern.
Error: Race condition in concurrent requests - singleton state corruption.
Resolution: Switched to per-request cache with dependency injection.
"""

lessons = client.extract(transcript)
print(lessons)
```

### evolve()

Trigger a promotion, abstraction, and pruning cycle for knowledge evolution.

**Returns:** dict with evolution statistics

**Example:**
```python
evolution = client.evolve()
print(f"Promoted: {evolution['promoted']}")
print(f"Abstracted: {evolution['abstracted']}")
print(f"Archived: {evolution['archived']}")

# Output:
# Promoted: 2
# Abstracted: 1
# Archived: 3
```

### stats()

Get usage statistics for the Experience Engine.

**Returns:** dict with stats about warnings generated, feedback submitted, and evolution cycles

**Example:**
```python
stats = client.stats()
print(f"Total warnings generated: {stats['total_warnings']}")
print(f"User feedback submissions: {stats['feedback_count']}")
```

### timeline(topic)

Retrieve knowledge evolution timeline for a specific topic.

**Parameters:**
- `topic` (str): Knowledge topic or pattern name

**Returns:** dict with timeline entries tracking solution evolution

**Example:**
```python
timeline = client.timeline("dependency injection")
for entry in timeline["timeline"]:
    print(f"  Solution: {entry['solution']}")
    print(f"  Confidence: {entry['confidence']}")
    print(f"  Superseded: {entry['superseded']}")
    print()
```

### feedback(point_id, collection, verdict)

Report user feedback on an experience point.

**Parameters:**
- `point_id` (str): ID of the experience point (from warning output)
- `collection` (str): Collection name (e.g., "experience-behavioral")
- `verdict` (str): One of `FOLLOWED`, `IGNORED`, `IRRELEVANT`

**Returns:** dict with feedback acknowledgment

**Example:**
```python
client.feedback(
    "a1b2c3d4",
    "experience-behavioral",
    "FOLLOWED"
)
```

### route_model(task, runtime)

Route a task to the optimal model based on complexity and resources.

**Parameters:**
- `task` (str): Description of the task
- `runtime` (str): Runtime context (e.g., "codex", "vertex", "claude-api")

**Returns:** dict with model recommendation

**Example:**
```python
recommendation = client.route_model(
    "Implement a complex state machine",
    "codex"
)

print(f"Model: {recommendation['model']}")
print(f"Tier: {recommendation['tier']}")
print(f"Reasoning Effort: {recommendation['reasoningEffort']}")
print(f"Confidence: {recommendation['confidence']}")

# Output:
# Model: claude-opus-4
# Tier: premium
# Reasoning Effort: high
# Confidence: 0.92
```

## Response Formats

### intercept() Response

```python
{
    "hasSuggestions": True,
    "suggestions": "⚠️ [Experience - High Confidence (0.85)]: Avoid singleton pattern for DbContext\n   Why: Causes state corruption under concurrent requests\n   [id:a1b2c3d4 col:experience-behavioral]"
}
```

### evolve() Response

```python
{
    "promoted": 2,        # Rules elevated to higher tier
    "abstracted": 1,      # Rules generalized to broader scope
    "archived": 3         # Rules moved to historical record
}
```

### route_model() Response

```python
{
    "tier": "premium",
    "model": "claude-opus-4",
    "reasoningEffort": "high",
    "confidence": 0.85,
    "source": "brain"
}
```

### timeline() Response

```python
{
    "topic": "dependency injection",
    "timeline": [
        {
            "solution": "Constructor injection for database context",
            "confidence": 0.92,
            "timestamp": "2025-02-15T10:30:00Z",
            "superseded": False,
            "reason": "Eliminates singleton state issues"
        },
        {
            "solution": "Service locator pattern",
            "confidence": 0.45,
            "timestamp": "2025-02-01T14:20:00Z",
            "superseded": True,
            "reason": "Testing complexity too high"
        }
    ]
}
```

## Error Handling

The SDK raises exceptions for connection and API errors:

```python
from muonroi_experience import Client, ExperienceEngineError

client = Client("http://localhost:8082")

try:
    result = client.intercept("Write", {"file_path": "app.py"})
except ExperienceEngineError as e:
    print(f"Error: {e}")
except ConnectionError as e:
    print(f"Connection failed: {e}")
```

## Integration with Claude Code

The Experience Engine integrates seamlessly with Claude Code agents via pre-tool hooks:

```python
# Claude Code agents automatically call intercept() before tool execution
# and posttool() after completion. Use the SDK to manually query or
# integrate with external systems.

client = Client("http://localhost:8082")

# Pre-tool query
warnings = client.intercept("Bash", {"command": "rm -rf /"})
if warnings["hasSuggestions"]:
    # Prevent dangerous operations
    print("Safety check:", warnings["suggestions"])

# Post-execution feedback
client.posttool(
    "Bash",
    {"command": "npm test"},
    {"success": True}
)
```

## Related Links

- [API Reference](./api-reference)
- [How It Works](./how-it-works)
- [Getting Started](./getting-started)
