Pod::Spec.new do |s|
  s.name             = 'wavefunc_bridge'
  s.version          = '0.2.0'
  s.summary          = 'Native Rust wavefunc-core FFI library for macOS'
  s.homepage         = 'https://wavefunc.live'
  s.license          = { :type => 'MIT' }
  s.author           = { 'WaveFunc' => 'dev@wavefunc.live' }
  s.source           = { :path => '.' }
  s.platform         = :osx, '12.0'
  s.resources        = 'Runner/Frameworks/libwavefunc_bridge.dylib'
end
