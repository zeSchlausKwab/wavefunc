// Comprehensive test of metadata extraction against diverse stream collection
import { probeStream } from './contextvm/tools/probe.ts';
import { readFileSync } from 'fs';

// Parse the test streams file to extract URLs
function parseTestStreams() {
  const content = readFileSync('./contextvm/tools/test-streams.txt', 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const urls = [];
  for (const line of lines) {
    // Extract URL from log format: "Bun HMR Runtime:1 📋 station: URL"
    const match = line.match(/📋 station: (.+)$/);
    if (match) {
      let url = match[1].trim();
      // Clean up any trailing semicolons or extra characters
      url = url.replace(/[;\s]+$/, '');
      urls.push(url);
    }
  }
  
  return urls;
}

async function testComprehensiveStreams() {
  const urls = parseTestStreams();
  console.log(`🔍 Testing ${urls.length} diverse streams for metadata extraction...\n`);
  
  const results = {
    total: urls.length,
    successful: 0,
    failed: 0,
    withMetadata: 0,
    withWarnings: 0,
    bySource: { ICY: 0, 'HLS-ID3': 0, PLAYLIST: 0, UNKNOWN: 0 },
    errors: []
  };
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] Testing: ${url.substring(0, 60)}...`);
    
    try {
      const result = await probeStream(url);
      results.successful++;
      results.bySource[result.source]++;
      
      const hasMetadata = result.artist || result.title || result.station;
      if (hasMetadata) results.withMetadata++;
      if (result.notes) results.withWarnings++;
      
      console.log(`  ✅ Source: ${result.source}`);
      console.log(`  📻 Station: ${result.station || 'Unknown'}`);
      if (result.artist && result.title) {
        console.log(`  🎵 Now playing: ${result.artist} - ${result.title}`);
      } else if (result.title) {
        console.log(`  🎵 Title: ${result.title}`);
      }
      if (result.notes) {
        console.log(`  ⚠️  Notes: ${result.notes}`);
      }
      
      // Log metadata size if available
      if (result.raw?.originalMetaLen) {
        console.log(`  📏 Metadata size: ${result.raw.originalMetaLen} bytes`);
      }
      
    } catch (error) {
      results.failed++;
      results.errors.push({ url: url.substring(0, 60), error: error.message });
      console.log(`  ❌ Failed: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Summary report
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`📈 Total streams tested: ${results.total}`);
  console.log(`✅ Successful extractions: ${results.successful} (${Math.round(results.successful/results.total*100)}%)`);
  console.log(`❌ Failed extractions: ${results.failed} (${Math.round(results.failed/results.total*100)}%)`);
  console.log(`🎵 Streams with metadata: ${results.withMetadata} (${Math.round(results.withMetadata/results.successful*100)}% of successful)`);
  console.log(`⚠️  Streams with warnings: ${results.withWarnings} (${Math.round(results.withWarnings/results.successful*100)}% of successful)`);
  
  console.log('\n📊 BY SOURCE TYPE:');
  Object.entries(results.bySource).forEach(([source, count]) => {
    if (count > 0) {
      console.log(`  ${source}: ${count} streams (${Math.round(count/results.successful*100)}%)`);
    }
  });
  
  if (results.errors.length > 0) {
    console.log('\n❌ FAILED STREAMS:');
    results.errors.forEach(({ url, error }) => {
      console.log(`  ${url}... - ${error}`);
    });
  }
  
  // Analysis
  console.log('\n🔍 ANALYSIS:');
  const warningRate = results.withWarnings / results.successful * 100;
  if (warningRate < 10) {
    console.log(`✅ Low warning rate (${Math.round(warningRate)}%) - thresholds appear well-calibrated`);
  } else if (warningRate < 25) {
    console.log(`⚠️  Moderate warning rate (${Math.round(warningRate)}%) - may need threshold adjustment`);
  } else {
    console.log(`🚨 High warning rate (${Math.round(warningRate)}%) - thresholds likely too strict`);
  }
  
  const successRate = results.successful / results.total * 100;
  if (successRate > 90) {
    console.log(`✅ Excellent success rate (${Math.round(successRate)}%) - robust extraction`);
  } else if (successRate > 75) {
    console.log(`👍 Good success rate (${Math.round(successRate)}%) - generally reliable`);
  } else {
    console.log(`⚠️  Lower success rate (${Math.round(successRate)}%) - may need improvement`);
  }
}

testComprehensiveStreams().catch(console.error);