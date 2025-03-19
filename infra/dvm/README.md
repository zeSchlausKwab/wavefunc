# Nostr DVM with DVMCP Support

This service implements a Nostr Data Vending Machine (DVM) with DVMCP (Data Vending Machine Context Protocol) support, enabling it to expose Model Context Protocol (MCP) tools through the Nostr network.

## Features

- **Music Recognition**: Uses AudD API to recognize songs from audio URLs
- **DVMCP Support**: Implements the DVMCP specification to expose MCP tools natively through Nostr
- **Tool Discovery**: Announces available tools via NIP-89 and direct requests
- **Job Execution**: Handles tool execution requests and provides standardized responses

## Architecture

The DVM consists of these main components:

1. **NDK Service**: Manages Nostr connectivity and event handling
2. **AudD Service**: Handles music recognition requests
3. **DVMCP Bridge**: Implements the DVMCP specification to expose MCP tools

## DVMCP Implementation

Our implementation follows the [DVMCP specification](https://github.com/gzuuus/dvmcp/blob/master/docs/dvmcp-spec.md), using these Nostr event kinds:

- **31990**: DVM Service Announcement (NIP-89)
- **5910**: DVM-MCP Bridge Requests
- **6910**: DVM-MCP Bridge Responses
- **7000**: Job Feedback

The DVMCP bridge handles:

- Tool discovery through NIP-89 announcements
- Tool discovery through direct list-tools requests
- Tool execution through execute-tool requests
- Feedback through status updates

## Getting Started

### Prerequisites

- Bun installed
- Nostr private key
- AudD API token

### Environment Variables

Configure the following environment variables:

```
# DVM Configuration
DVM_PRIVATE_KEY=your_private_key

# AudD Configuration
AUDD_API_TOKEN=your_audd_api_token
```

### Running the DVM

```bash
bun run dev
```

## Using the DVM

Clients can discover and use the DVM services in two ways:

1. **Through DVMCP**:

    - Discover tools via NIP-89 events (kind 31990) with tag 'capabilities': 'mcp-1.0'
    - Or send a direct request with kind 5910 and tag 'c': 'list-tools'
    - Execute tools with kind 5910 events and tag 'c': 'execute-tool'

2. **Direct DVM**:
    - Send job requests with kind 5000
    - Receive results with kind 6000
