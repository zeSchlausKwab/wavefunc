#!/bin/bash

# Test Environment Configuration for all packages
echo "🔍 Testing Environment Configuration for All Packages"
echo "=================================================="
echo ""

# Get the absolute path to the project root
PROJECT_ROOT="$(pwd)"

# Function to run a test:env script and check its result
run_test() {
    local package_name=$1
    local command=$2
    
    echo "📦 Testing $package_name environment..."
    echo "-----------------------------------"
    
    # Run the test command
    eval $command
    
    # Check the result
    if [ $? -eq 0 ]; then
        echo "✅ $package_name environment test passed"
    else
        echo "❌ $package_name environment test failed"
        FAILED_TESTS+=("$package_name")
    fi
    
    echo ""
}

# Array to track failed tests
FAILED_TESTS=()

# Run tests for each package
run_test "Backend" "cd \"$PROJECT_ROOT/apps/backend\" && bun run test:env"
run_test "Web" "cd \"$PROJECT_ROOT/apps/web\" && bun run test:env"
run_test "DVM" "cd \"$PROJECT_ROOT/infra/dvm\" && bun run test:env"
run_test "Relay" "cd \"$PROJECT_ROOT/infra/relay\" && bash ./env-test.sh"

# Summary
echo "📊 Environment Test Summary"
echo "========================="

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "🎉 All environment tests passed successfully!"
else
    echo "⚠️ The following packages had environment test failures:"
    for package in "${FAILED_TESTS[@]}"; do
        echo "  - $package"
    done
    echo ""
    echo "Please check the configuration for these packages."
    exit 1
fi 