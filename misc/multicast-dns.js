var mdns = require('multicast-dns')({loopback: true})

mdns.on('response', function (response) {
    //console.log('got a response packet:', response)
    if (response.answers[0].name.includes('smartthings')) {
        console.log('TXT data:', response.additionals[0].data.toString())
        console.log('SRV data:', JSON.stringify(response.additionals[1].data))
        console.log('IP Address:', response.additionals[2].data)
    }
})

mdns.on('query', function (query) {
    console.log('got a query packet:', query)
    query.questions.forEach(function (q) {
        console.log('query response name = ', q.name)

        if (q.name === '_http._tcp.local') {
            // send an A-record response for example.local
            console.log("responding to query")
            mdns.respond({
                answers: [{
                    name: 'POOL.local',
                    type: 'A',
                    ttl: 300,
                    data: '192.168.1.5'
                }]
            })
        }

        if (q.name === '_services._dns-sd._udp.local') {
            console.log("responding to query to pool")
            mdns.respond({
                answers: [{
                    name: '_poolCtrl._tcp.local',
                    type: 'PTR',
                    class: 1,
                    ttl: 120,
                    flush: true,
                    data: '24FD5B000004C819._poolCtrl._tcp.local'
                }],
                authorities: [],
                additionals:
                    [{
                        name: '24FD5B000004C819._poolCtrl._tcp.local',
                        type: 'TXT',
                        class: 1,
                        ttl: 120,
                        flush: true,
                        data: new Buffer("my buffer")
                    }, //TXT data: path=/id=24FD5B000004C819  type=hubv
                        {
                            name: '24FD5B000004C819._poolCtrl._tcp.local',
                            type: 'SRV',
                            class: 1,
                            ttl: 120,
                            flush: true,
                            data: {"key": "val"}
                        },                         // SRV data: {"priority":0,"weight":0,"port":8081,"target":"24FD5B000004C819._poolCtrl._tcp.local"}
                        {
                            name: '24FD5B000004C819._poolCtrl._tcp.local',
                            type: 'A',
                            class: 1,
                            ttl: 120,
                            flush: true,
                            data: '11.11.77.77'
                        }]
            })
        }
    })
})

// lets query for an A record for 'brunhilde.local'
mdns.query({
    questions: [{
        name: '_smartthings._tcp.local',
        type: 'PTR'
    }]
})
mdns.query({
    questions: [{
        name: '_nodejsPoolCtrl._http._tcp.local',
        type: 'PTR'
    }]
})

/*
got a response packet: { id: 0,
  type: 'response',
  flags: 1024,
  flag_qr: true,
  opcode: 'QUERY',
  flag_auth: true,
  flag_trunc: false,
  flag_rd: false,
  flag_ra: false,
  flag_z: false,
  flag_ad: false,
  flag_cd: false,
  rcode: 'NOERROR',
  questions: [],
  answers:
   [ { name: '_smartthings._tcp.local',
       type: 'PTR',
       class: 1,
       ttl: 120,
       flush: true,
       data: '24FD5B000004C819._smartthings._tcp.local' } ],
  authorities: [],
  additionals:
   [ { name: '24FD5B000004C819._smartthings._tcp.local',
       type: 'TXT',
       class: 1,
       ttl: 120,
       flush: true,
       data: <Buffer 06 70 61 74 68 3d 2f 13 69 64 3d 32 34 46 44 35 42 30 30 30 30 30 34 43 38 31 39 0a 74 79 70 65 3d 68 75 62 76 32> },
       //TXT data: path=/id=24FD5B000004C819  type=hubv2
     { name: '24FD5B000004C819._smartthings._tcp.local',
       type: 'SRV',
       class: 1,
       ttl: 120,
       flush: true,
       data: [Object] },
       // SRV data: {"priority":0,"weight":0,"port":8081,"target":"24FD5B000004C819._smartthings._tcp.local"}
     { name: '24FD5B000004C819._smartthings._tcp.local',
       type: 'A',
       class: 1,
       ttl: 120,
       flush: true,
       data: '11.11.11.7' } ] }
 */
