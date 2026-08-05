# Apache Commons Compress 1.12 registers ZIP extra-field implementations by
# instantiating class literals through Class.newInstance(). R8 can otherwise
# merge a registered implementation into an abstract base class, which makes
# YoutubeDL.init crash with ExceptionInInitializerError in release builds.
-keep class org.apache.commons.compress.archivers.zip.** { *; }
-keepattributes InnerClasses,EnclosingMethod
