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
                <td>uuid</td>
                <td><a href="https://en.wikipedia.org/wiki/Universally_unique_identifier">UUID</a></td>
                <td>An unique id for this StreamingServer</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>url</td>
                <td>string, URL (HTTP/HTTPS)</td>
                <td>The url that this streaming server</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>statusurl</td>
                <td>string, URL (HTTP/HTTPS)</td>
                <td>The url for fetching extended meta information from this streaming server</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>error</td>
                <td>string</td>
                <td>If this field exists, the server either does not have extended information or the information was not parsable</td>
                <td>YES</td>
              </tr>
              <tr>
                <td>admin</td>
                <td>string/email</td>
                <td>Administrative contact of the streaming server</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>location</td>
                <td>string/address</td>
                <td>Physical location of the streaming server</td>
                <td>NO</td>
              </tr>
              <tr>
                <td>software</td>
                <td>string</td>
                <td>Server software name and version</td>
                <td>NO</td>
              </tr>
            </tbody>
          </table>
```

```
Example JSON:
  [
  {
    "uuid":"11234567-89ab-cdef-0123-456789abcdef",
    "url":"https://my.url/",
    "statusurl":"https://my.url/status.xsl",
    "admin":"tester@example.com",
    "location":"Mars, high street 3",
    "software": "Icecast 2.4.4"
  },
  {
    "uuid":"11234567-89ab-cdef-0123-456789abcdff",
    "url":"http://my.url/",
    "error":"ResultDecodeError"
  }
]
```