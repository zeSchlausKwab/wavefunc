#!/bin/bash

# Relay Environment Configuration Test
echo "🔍 Relay Environment Configuration Test"
echo "===================================="
echo ""

# Source environment variables from the root .env file
if [ -f "../../.env" ]; then
    # Export variables from .env file
    export $(grep -v '^#' ../../.env | xargs)
    echo "✅ Loaded environment variables from root .env file"
else
    echo "❌ Could not find root .env file"
fi

echo ""

# Check if the relay can access all required environment variables
echo "🧪 Environment Variable Check:"

# Define required variables
required_vars=(
    "PUBLIC_RELAY_PORT"
    "PUBLIC_RELAY_PUBKEY"
    "PUBLIC_RELAY_CONTACT"
    "POSTGRES_CONNECTION_STRING"
)

all_vars_present=true

# Check each variable
for var_name in "${required_vars[@]}"; do
    if [ -z "${!var_name}" ]; then
        echo "  $var_name: ❌"
        all_vars_present=false
    else
        echo "  $var_name: ✅"
    fi
done

echo ""

# Display relay configuration
echo "📡 Relay Configuration:"
echo "  Port: $PUBLIC_RELAY_PORT"
echo "  Public Key: $PUBLIC_RELAY_PUBKEY"
echo "  Contact: $PUBLIC_RELAY_CONTACT"
echo ""

# Display database configuration
echo "🗄️ Database Configuration:"
# Mask the connection string to hide sensitive information
if [ ! -z "$POSTGRES_CONNECTION_STRING" ]; then
    masked_connection_string=$(echo "$POSTGRES_CONNECTION_STRING" | sed 's/:[^:@]*@/:*****@/')
    echo "  Connection String: $masked_connection_string"
else
    echo "  Connection String: (not set)"
fi
echo ""

# Final status
if [ "$all_vars_present" = true ]; then
    echo "✅ Relay environment configuration test completed successfully!"
    exit 0
else
    echo "⚠️ Some environment variables are missing. Check the configuration."
    exit 1
fi 