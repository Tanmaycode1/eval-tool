# Prompt Chain JSON Format

The application supports multiple JSON formats for prompt chains. The system automatically detects and processes the following formats:

## Format 1: PostHog Query Result Format (Recommended)

This is the format returned by PostHog queries:

```json
{
  "results": [
    [
      "event-uuid-1",
      "ai_generation",
      "2024-01-15T10:30:00Z",
      "gpt-4",
      "[{\"role\": \"user\", \"content\": \"What is AI?\"}]",
      "[{\"role\": \"assistant\", \"content\": \"{\\\"response\\\": \\\"AI is...\\\"}\"}]",
      100,
      50,
      0.01,
      "1.5s",
      "Step 1: Research",
      "My Chain",
      {}
    ],
    [
      "event-uuid-2",
      "ai_generation",
      "2024-01-15T10:30:02Z",
      "gpt-4",
      "[{\"role\": \"user\", \"content\": \"Summarize that\"}]",
      "[{\"role\": \"assistant\", \"content\": \"{\\\"response\\\": \\\"Summary...\\\"}\"}]",
      50,
      30,
      0.005,
      "0.8s",
      "Step 2: Summarize",
      "My Chain",
      {}
    ]
  ]
}
```

**Row Structure** (13 elements):
1. `uuid` - Event UUID/ID
2. `event` - Event type (usually "ai_generation")
3. `timestamp` - ISO timestamp
4. `model` - Model name (e.g., "gpt-4", "claude-3-opus")
5. `ai_input` - User input (JSON string or array of message objects)
6. `ai_output` - Assistant output (JSON string or array of choice objects)
7. `input_tokens` - Number of input tokens
8. `output_tokens` - Number of output tokens
9. `cost` - Cost in USD
10. `latency` - Latency string (e.g., "1.5s")
11. `span_name` - Step/span name
12. `chain_name` - Name of the chain
13. `prompt_schema` - Prompt schema object (optional)

## Format 2: Chain Object with Events Array

```json
{
  "trace_id": "trace-123-456",
  "chain_name": "My Chain",
  "events": [
    {
      "id": "event-uuid-1",
      "uuid": "event-uuid-1",
      "event": "ai_generation",
      "timestamp": "2024-01-15T10:30:00Z",
      "model": "gpt-4",
      "properties": {
        "$ai_model": "gpt-4",
        "$ai_input": "[{\"role\": \"user\", \"content\": \"What is AI?\"}]",
        "$ai_output_choices": [{"content": "{\"response\": \"AI is...\"}"}],
        "$ai_input_tokens": 100,
        "$ai_output_tokens": 50,
        "$ai_total_cost_usd": 0.01,
        "$ai_latency": "1.5s",
        "$ai_span_name": "Step 1: Research",
        "chain_name": "My Chain",
        "promptSchema": {}
      }
    },
    {
      "id": "event-uuid-2",
      "uuid": "event-uuid-2",
      "event": "ai_generation",
      "timestamp": "2024-01-15T10:30:02Z",
      "model": "gpt-4",
      "properties": {
        "$ai_model": "gpt-4",
        "$ai_input": "[{\"role\": \"user\", \"content\": \"Summarize that\"}]",
        "$ai_output_choices": [{"content": "{\"response\": \"Summary...\"}"}],
        "$ai_input_tokens": 50,
        "$ai_output_tokens": 30,
        "$ai_total_cost_usd": 0.005,
        "$ai_latency": "0.8s",
        "$ai_span_name": "Step 2: Summarize",
        "chain_name": "My Chain",
        "promptSchema": {}
      }
    }
  ]
}
```

**Alternative**: You can also use `chain_events` instead of `events`:

```json
{
  "trace_id": "trace-123-456",
  "chain_name": "My Chain",
  "chain_events": [...]
}
```

## Format 3: Array of Event Objects

```json
[
  {
    "id": "event-uuid-1",
    "uuid": "event-uuid-1",
    "event": "ai_generation",
    "timestamp": "2024-01-15T10:30:00Z",
    "model": "gpt-4",
    "properties": {
      "$ai_model": "gpt-4",
      "$ai_input": "[{\"role\": \"user\", \"content\": \"What is AI?\"}]",
      "$ai_output_choices": [{"content": "{\"response\": \"AI is...\"}"}],
      "$ai_input_tokens": 100,
      "$ai_output_tokens": 50,
      "$ai_total_cost_usd": 0.01,
      "$ai_latency": "1.5s",
      "$ai_span_name": "Step 1: Research",
      "chain_name": "My Chain",
      "promptSchema": {}
    }
  },
  {
    "id": "event-uuid-2",
    "uuid": "event-uuid-2",
    "event": "ai_generation",
    "timestamp": "2024-01-15T10:30:02Z",
    "model": "gpt-4",
    "properties": {
      "$ai_model": "gpt-4",
      "$ai_input": "[{\"role\": \"user\", \"content\": \"Summarize that\"}]",
      "$ai_output_choices": [{"content": "{\"response\": \"Summary...\"}"}],
      "$ai_input_tokens": 50,
      "$ai_output_tokens": 30,
      "$ai_total_cost_usd": 0.005,
      "$ai_latency": "0.8s",
      "$ai_span_name": "Step 2: Summarize",
      "chain_name": "My Chain",
      "promptSchema": {}
    }
  }
]
```

## Format 4: Simplified Event Format

For formats 2 and 3, you can also use simplified event structures. The system will map fields as follows:

```json
{
  "events": [
    {
      "id": "event-1",
      "event": "ai_generation",
      "timestamp": "2024-01-15T10:30:00Z",
      "model": "gpt-4",
      "user_prompt": "What is AI?",
      "assistant_response": {"response": "AI is..."},
      "input_tokens": 100,
      "output_tokens": 50,
      "total_cost": 0.01,
      "latency": "1.5s",
      "name": "Step 1: Research",
      "prompt_schema": {}
    }
  ],
  "chain_name": "My Chain"
}
```

## Field Mapping

The system automatically maps fields from different locations:

### Event ID
- `id` or `uuid` (top-level or in properties)

### Model
- `properties.$ai_model` or `model` (top-level)

### User Input
- `properties.$ai_input` or `user_prompt` (top-level)
- Can be:
  - JSON string: `"[{\"role\": \"user\", \"content\": \"text\"}]"`
  - Array of message objects: `[{"role": "user", "content": "text"}]`
  - Plain string: `"text"`

### Assistant Output
- `properties.$ai_output_choices` or `assistant_response` (top-level)
- Can be:
  - Array of choice objects: `[{"content": "..."}]`
  - JSON string: `"[{\"role\": \"assistant\", \"content\": \"...\"}]"`
  - Plain object: `{"response": "..."}`

### Tokens
- `properties.$ai_input_tokens` or `input_tokens` (top-level)
- `properties.$ai_output_tokens` or `output_tokens` (top-level)

### Cost
- `properties.$ai_total_cost_usd` or `total_cost` (top-level)

### Latency
- `properties.$ai_latency` or `latency` (top-level)
- Can be string (e.g., "1.5s") or number

### Span/Step Name
- `properties.$ai_span_name` or `name` (top-level)

### Chain Name
- `chain_name` (top-level) or `properties.chain_name`

### Trace ID
- `trace_id` (top-level)
- `properties.$ai_trace_id` or `properties.trace_id`
- `metadata.trace_id`
- Extracted from first event if not present
- Auto-generated if missing

## Image Support

For user images, include them in the `$ai_input` array:

```json
{
  "properties": {
    "$ai_input": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What's in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.png"
            }
          }
        ]
      }
    ]
  }
}
```

Or use the simplified format:

```json
{
  "user_images": ["https://example.com/image.png"],
  "user_prompt": "What's in this image?"
}
```

## Detection Logic

The system detects a chain JSON if it has:
- `events` or `chain_events` array with multiple items
- `results` array (PostHog format)
- Is an array of multiple event objects
- Has `trace_id` AND (`events` or `chain_events` or `results`)

A single event is detected if it has:
- `id` or `uuid` AND `properties.$ai_input` (without chain structure)

## Examples

### Minimal Chain Example

```json
{
  "events": [
    {
      "properties": {
        "$ai_input": "Hello",
        "$ai_output_choices": [{"content": "{\"response\": \"Hi!\"}"}]
      }
    },
    {
      "properties": {
        "$ai_input": "How are you?",
        "$ai_output_choices": [{"content": "{\"response\": \"I'm good!\"}"}]
      }
    }
  ]
}
```

### Full Chain Example

```json
{
  "trace_id": "2024-01-15T10:30:00.123Z_abc123_def456",
  "chain_name": "Customer Support Chain",
  "events": [
    {
      "id": "evt-001",
      "timestamp": "2024-01-15T10:30:00Z",
      "properties": {
        "$ai_model": "gpt-4",
        "$ai_input": "[{\"role\": \"user\", \"content\": \"Customer complaint about order\"}]",
        "$ai_output_choices": [{"content": "{\"response\": \"I understand your concern...\"}"}],
        "$ai_input_tokens": 150,
        "$ai_output_tokens": 200,
        "$ai_total_cost_usd": 0.015,
        "$ai_latency": "2.3s",
        "$ai_span_name": "Initial Response",
        "chain_name": "Customer Support Chain",
        "promptSchema": {
          "type": "object",
          "properties": {
            "tone": {"type": "string"}
          }
        }
      }
    },
    {
      "id": "evt-002",
      "timestamp": "2024-01-15T10:30:03Z",
      "properties": {
        "$ai_model": "gpt-4",
        "$ai_input": "[{\"role\": \"user\", \"content\": \"Follow up with solution\"}]",
        "$ai_output_choices": [{"content": "{\"response\": \"Here's what we can do...\"}"}],
        "$ai_input_tokens": 100,
        "$ai_output_tokens": 150,
        "$ai_total_cost_usd": 0.01,
        "$ai_latency": "1.8s",
        "$ai_span_name": "Solution Proposal",
        "chain_name": "Customer Support Chain"
      }
    }
  ]
}
```

