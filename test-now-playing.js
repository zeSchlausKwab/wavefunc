// Test script to show actual now playing data from streams
import { probeStream } from './contextvm/tools/probe.ts';
import { readFileSync } from 'fs';

// Parse the test streams file to extract URLs
function parseTestStreams() {
  const content = readFileSync('./contextvm/tools/test-streams.txt', 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  const urls = [];
  for (const line of lines) {
    const match = line.match(/📋 station: (.+)$/);
    if (match) {
      let url = match[1].trim();
      url = url.replace(/[;\s]+$/, '');
      urls.push(url);
    }
  }
  
  return urls;
}

async function testNowPlayingData() {
  const urls = parseTestStreams();
  console.log(`🎵 Testing streams for actual now playing data...\n`);
  
  const streamsWithMusic = [];
  let tested = 0;
  
  // Test a subset of streams to find ones with active now playing data
  for (const url of urls.slice(0, 20)) { // Test first 20 streams
    tested++;
    console.log(`[${tested}/20] Testing: ${url.substring(0, 70)}...`);
    
    try {
      const result = await probeStream(url);
      
      const hasNowPlaying = result.artist || result.title;
      const station = result.station || 'Unknown Station';
      
      console.log(`  📻 Station: ${station}`);
      console.log(`  🔧 Source: ${result.source}`);
      
      if (hasNowPlaying) {
        console.log(`  🎵 NOW PLAYING:`);
        if (result.artist && result.title) {
          console.log(`      🎤 Artist: ${result.artist}`);
          console.log(`      🎶 Title: ${result.title}`);
        } else if (result.title) {
          console.log(`      🎶 Title: ${result.title}`);
        }
        
        streamsWithMusic.push({
          url: url.substring(0, 50) + '...',
          station,
          artist: result.artist,
          title: result.title,
          source: result.source
        });
      } else {
        console.log(`  ⭕ No current song info`);
      }
      
      if (result.notes) {
        console.log(`  📝 Notes: ${result.notes}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
    
    console.log('');
  }
  
  // Summary of streams with actual music data
  console.log('\n' + '='.repeat(80));
  console.log('🎵 STREAMS WITH ACTIVE NOW PLAYING DATA');
  console.log('='.repeat(80));
  
  if (streamsWithMusic.length === 0) {
    console.log('⭕ No streams currently have now playing data.');
    console.log('💡 This is normal - many streams only show station info, not current songs.');
    console.log('💡 Try testing at different times when songs are actively playing.');
  } else {
    console.log(`Found ${streamsWithMusic.length} streams with current song info:\n`);
    
    streamsWithMusic.forEach((stream, i) => {
      console.log(`${i + 1}. 📻 ${stream.station}`);
      console.log(`   🔗 ${stream.url}`);
      console.log(`   🔧 Source: ${stream.source}`);
      if (stream.artist && stream.title) {
        console.log(`   🎵 ${stream.artist} - ${stream.title}`);
      } else if (stream.title) {
        console.log(`   🎵 ${stream.title}`);
      }
      console.log('');
    });
  }
  
  console.log('\n💡 TIP: Radio streams often update their metadata every few minutes.');
  console.log('💡 If you want to see more active data, try running this test multiple times');
  console.log('💡 or test during peak listening hours when more songs are playing.');
}

testNowPlayingData().catch(console.error);