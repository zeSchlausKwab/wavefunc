```
<table class="table mt-2 table-striped">
            <thead class="thead-dark">
              <tr>
                <th scope="col">Name</th>
                <th scope="col" width="300">Possible value/Datatype</th>
                <th scope="col">Description</th>
                <th scope="col">Nullable</th>
              </tr>
            </thead>

            <tbody>
              <tr>
                <td>checkuuid</td>
                <td><a href="https://en.wikipedia.org/wiki/Universally_unique_identifier">UUID</a></td>
                <td>An unique id for this StationCheck</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>stationuuid</td>
                <td><a href="https://en.wikipedia.org/wiki/Universally_unique_identifier">UUID</a></td>
                <td>An unique id for referencing a Station</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>source</td>
                <td>string</td>
                <td>DNS Name of the server that did the stream check.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>codec</td>
                <td>string</td>
                <td>High level name of the used codec of the stream. May have the format AUDIO or AUDIO/VIDEO.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>bitrate</td>
                <td>number, integer</td>
                <td>Bitrate 1000 bits per second (kBit/s) of the stream. (Audio + Video)</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>hls</td>
                <td>number, integer</td>
                <td>1 means this is an <a href="https://en.wikipedia.org/wiki/HTTP_Live_Streaming">HLS stream</a>,
                  otherwise 0.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>ok</td>
                <td>number, integer</td>
                <td>1 means this stream is reachable, otherwise 0.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>timestamp_iso8601</td>
                <td><a href="https://en.wikipedia.org/wiki/ISO_8601">ISO-8601</a> datetime string</td>
                <td>Date and time of check creation</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>timestamp</td>
                <td>datetime, YYYY-MM-DD HH:mm:ss</td>
                <td>Date and time of check creation</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>urlcache</td>
                <td>string, URL (HTTP/HTTPS)</td>
                <td>Direct stream url that has been resolved from the main stream url. HTTP redirects and playlists have
                  been decoded. If hls==1 then this is still a HLS-playlist.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>metainfo_overrides_database</td>
                <td>number, integer</td>
                <td>1 means this stream has provided extended information and it should be used to override the local
                  database, otherwise 0.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>public</td>
                <td>number, integer</td>
                <td>1 that this stream appears in the public shoutcast/icecast directory, otherwise 0.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>name</td>
                <td>string</td>
                <td>The name extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>description</td>
                <td>string</td>
                <td>The description extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>tags</td>
                <td>string</td>
                <td>Komma separated list of tags. (genres of this stream)</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>countrycode</td>
                <td>string</td>
                <td>Official countrycodes as in <a href="https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2">ISO 3166-1
                    alpha-2</a></td>
                <td>YES</td>
              </tr>
              <tr>
                <td>countrysubdivisioncode</td>
                <td>string</td>
                <td>Official country subdivision codes as in <a href="https://en.wikipedia.org/wiki/ISO_3166-2">ISO
                    3166-2</a></td>
                <td>YES</td>
              </tr>
              <tr>
                <td>homepage</td>
                <td>string</td>
                <td>The homepage extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>favicon</td>
                <td>string</td>
                <td>The favicon extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>loadbalancer</td>
                <td>string</td>
                <td>The loadbalancer extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>server_software</td>
                <td>string</td>
                <td>The name of the server software used.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>sampling</td>
                <td>number, unsigned integer</td>
                <td>Audio sampling frequency in Hz</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>timing_ms</td>
                <td>number, unsigned integer</td>
                <td>Timespan in miliseconds this check needed to be finished.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>languagecodes</td>
                <td>string</td>
                <td>The description extracted from the stream header.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>ssl_error</td>
                <td>number, unsigned integer</td>
                <td>1 means that a ssl error occured while connecting to the stream, 0 otherwise.</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>geo_lat</td>
                <td>number, double</td>
                <td>Latitude on earth where the stream is located.</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>geo_long</td>
                <td>number, double</td>
                <td>Longitude on earth where the stream is located.</td>
                <td>YES</td>
              </tr>
            </tbody>
          </table>


```

```

Example JSON:
  {
    "changeuuid":"01234567-89ab-cdef-0123-456789abcdef",
    "stationuuid":"01234567-89ab-cdef-0123-456789abcdef",
    "name":"Best Radio",
    "url":"http://www.example.com/test.pls",
    "url_resolved":"http://stream.example.com/mp3_128",
    "homepage":"https://www.example.com",
    "favicon":"https://www.example.com/icon.png",
    "tags":"jazz,pop,rock,indie",
    "country":"Switzerland",
    "countrycode":"US",
    "iso_3166_2": "US-NY",
    "state":"",
    "language":"german,english",
    "languagecodes":"ger,eng"
    "votes":0,
    "lastchangetime":"2019-12-12 18:37:02",
    "lastchangetime_iso8601":"2019-12-12T18:37:02Z",
    "codec":"MP3",
    "bitrate":128,
    "hls":0,
    "lastcheckok":1,
    "lastchecktime":"2020-01-09 18:16:35",
    "lastchecktime_iso8601":"2020-01-09T18:16:35Z",
    "lastcheckoktime":"2020-01-09 18:16:35",
    "lastcheckoktime_iso8601":"2020-01-09T18:16:35Z",
    "lastlocalchecktime":"2020-01-08 23:18:38",
    "lastlocalchecktime_iso8601":"2020-01-08T23:18:38Z",
    "clicktimestamp":"",
    "clicktimestamp_iso8601":null,
    "clickcount":0,
    "clicktrend":0,
    "ssl_error": 0,
    "geo_lat": 1.1,
    "geo_long": -2.2,
    "geo_distance": 1234.56789,
    "has_extended_info": false
  }
```