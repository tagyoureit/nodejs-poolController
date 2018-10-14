module.exports = function (container) {

    /*
    This is an integration to log all packets to a MySQL Database.
     Add the following to your config.json.

     "integrations": {
\        "mysqlIntegration": 1
    },
    "mysqlIntegration": {
        "host": "server",
        "port": port,
        "user": "username",
        "password": "password",
        "database": "database",
        "log": {
            "enabled": 1
        }
    }

    and create the following tables in MySql
    --
-- Table structure for table `chlorinatorpacket`
--

CREATE TABLE `chlorinatorpacket` (
 `id` int(11) NOT NULL AUTO_INCREMENT,
 `action` int(11) DEFAULT NULL,
 `p1` int(11) DEFAULT NULL,
 `p2` int(11) DEFAULT NULL,
 `p3` int(11) DEFAULT NULL,
 `p4` int(11) DEFAULT NULL,
 `p5` int(11) DEFAULT NULL,
 `p6` int(11) DEFAULT NULL,
 `p7` int(11) DEFAULT NULL,
 `p8` int(11) DEFAULT NULL,
 `p9` int(11) DEFAULT NULL,
 `p10` int(11) DEFAULT NULL,
 `p11` int(11) DEFAULT NULL,
 `p12` int(11) DEFAULT NULL,
 `p13` int(11) DEFAULT NULL,
 `p14` int(11) DEFAULT NULL,
 `p15` int(11) DEFAULT NULL,
 `p16` int(11) DEFAULT NULL,
 `p17` int(11) DEFAULT NULL,
 `p18` int(11) DEFAULT NULL,
 `p19` int(11) DEFAULT NULL,
 `p20` int(11) DEFAULT NULL,
 `datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `counter` int(11) DEFAULT NULL,
 `raw_packet` varchar(256) DEFAULT NULL,
 `p0` int(11) DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=63430 DEFAULT CHARSET=utf8



Table
Create Table
controllerpacket
CREATE TABLE `controllerpacket` (
 `id` int(11) NOT NULL AUTO_INCREMENT,
 `action` int(11) DEFAULT NULL,
 `src` int(11) DEFAULT NULL,
 `dest` int(11) DEFAULT NULL,
 `p1` int(11) DEFAULT NULL,
 `p2` int(11) DEFAULT NULL,
 `p3` int(11) DEFAULT NULL,
 `p4` int(11) DEFAULT NULL,
 `p5` int(11) DEFAULT NULL,
 `p6` int(11) DEFAULT NULL,
 `p7` int(11) DEFAULT NULL,
 `p8` int(11) DEFAULT NULL,
 `p9` int(11) DEFAULT NULL,
 `p10` int(11) DEFAULT NULL,
 `p11` int(11) DEFAULT NULL,
 `p12` int(11) DEFAULT NULL,
 `p13` int(11) DEFAULT NULL,
 `p14` int(11) DEFAULT NULL,
 `p15` int(11) DEFAULT NULL,
 `p16` int(11) DEFAULT NULL,
 `p17` int(11) DEFAULT NULL,
 `p18` int(11) DEFAULT NULL,
 `p19` int(11) DEFAULT NULL,
 `p20` int(11) DEFAULT NULL,
 `p21` int(11) DEFAULT NULL,
 `p22` int(11) DEFAULT NULL,
 `p23` int(11) DEFAULT NULL,
 `p24` int(11) DEFAULT NULL,
 `p25` int(11) DEFAULT NULL,
 `p26` int(11) DEFAULT NULL,
 `p27` int(11) DEFAULT NULL,
 `p28` int(11) DEFAULT NULL,
 `p29` int(11) DEFAULT NULL,
 `p30` int(11) DEFAULT NULL,
 `p31` int(11) DEFAULT NULL,
 `p32` int(11) DEFAULT NULL,
 `p33` int(11) DEFAULT NULL,
 `p34` int(11) DEFAULT NULL,
 `p35` int(11) DEFAULT NULL,
 `p36` int(11) DEFAULT NULL,
 `p37` int(11) DEFAULT NULL,
 `p38` int(11) DEFAULT NULL,
 `p39` int(11) DEFAULT NULL,
 `p40` int(11) DEFAULT NULL,
 `p41` int(11) DEFAULT NULL,
 `p42` int(11) DEFAULT NULL,
 `p43` int(11) DEFAULT NULL,
 `p44` int(11) DEFAULT NULL,
 `p45` int(11) DEFAULT NULL,
 `p46` int(11) DEFAULT NULL,
 `p47` int(11) DEFAULT NULL,
 `p48` int(11) DEFAULT NULL,
 `p49` int(11) DEFAULT NULL,
 `p50` int(11) DEFAULT NULL,
 `datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `counter` int(11) DEFAULT NULL,
 `raw_packet` varchar(256) DEFAULT NULL,
 `p0` int(11) DEFAULT NULL,
 `p51` int(11) DEFAULT NULL,
 `p52` int(11) DEFAULT NULL,
 `p53` int(11) DEFAULT NULL,
 `p54` int(11) DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=808066 DEFAULT CHARSET=utf8

CREATE TABLE `pumppacket` (
 `id` int(11) NOT NULL AUTO_INCREMENT,
 `action` int(11) DEFAULT NULL,
 `src` int(11) DEFAULT NULL,
 `dest` int(11) DEFAULT NULL,
 `p1` int(11) DEFAULT NULL,
 `p2` int(11) DEFAULT NULL,
 `p3` int(11) DEFAULT NULL,
 `p4` int(11) DEFAULT NULL,
 `p5` int(11) DEFAULT NULL,
 `p6` int(11) DEFAULT NULL,
 `p7` int(11) DEFAULT NULL,
 `p8` int(11) DEFAULT NULL,
 `p9` int(11) DEFAULT NULL,
 `p10` int(11) DEFAULT NULL,
 `p11` int(11) DEFAULT NULL,
 `p12` int(11) DEFAULT NULL,
 `p13` int(11) DEFAULT NULL,
 `p14` int(11) DEFAULT NULL,
 `p15` int(11) DEFAULT NULL,
 `p16` int(11) DEFAULT NULL,
 `p17` int(11) DEFAULT NULL,
 `p18` int(11) DEFAULT NULL,
 `p19` int(11) DEFAULT NULL,
 `p20` int(11) DEFAULT NULL,
 `p21` int(11) DEFAULT NULL,
 `p22` int(11) DEFAULT NULL,
 `p23` int(11) DEFAULT NULL,
 `p24` int(11) DEFAULT NULL,
 `p25` int(11) DEFAULT NULL,
 `p26` int(11) DEFAULT NULL,
 `p27` int(11) DEFAULT NULL,
 `p28` int(11) DEFAULT NULL,
 `p29` int(11) DEFAULT NULL,
 `p30` int(11) DEFAULT NULL,
 `datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
 `counter` int(11) DEFAULT NULL,
 `raw_packet` varchar(256) DEFAULT NULL,
 `p0` int(11) DEFAULT NULL,
 PRIMARY KEY (`id`),
 UNIQUE KEY `id_UNIQUE` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=984573 DEFAULT CHARSET=utf8


     */

    var mysql = require('mysql')

    var configFile = container.settings.getConfig()

    var host = configFile.mysqlIntegration.host
    var port = configFile.mysqlIntegration.port
    var user = configFile.mysqlIntegration.user
    var password = configFile.mysqlIntegration.password
    var database = configFile.mysqlIntegration.database

    var logEnabled = 0


    var connection = mysql.createConnection({
        host: host,
        port: port,
        user: user,
        password: password,
        database: database
    });


    if (configFile.mysqlIntegration.hasOwnProperty("log")) {
        logEnabled = configFile.mysqlIntegration.log.enabled
    }

    function startConnection() {
        connection.connect(function (err) {
            if (err) {
                container.logger.error('mysql: error connecting: ' + err.stack);
                return;
            }

            container.logger.debug('mysql: connected as id ' + connection.threadId);
        });
    }


    function init() {
        if (logEnabled) {
            container.logger.info('mysql Loaded. \n\thost: %s\n\tusername: %s\n\tdatabase: %s', host, user, database)
        }
    }

    var e = container.decodeHelper.emitter;
    e.on('controllerpacket', function (data, counter) {
        // var chkhigh = data[data.length - 2];
        // var chklow = data[data.length - 1];
        var src = data[container.constants.packetFields.FROM];
        var dest = data[container.constants.packetFields.DEST];
        var action = data[container.constants.packetFields.ACTION]


        var packet = {counter: counter, raw_packet: data.toString(), action: action, src: src, dest: dest};

        for (var i = 0; i <= data.length - 1; i++) {
            packet['p' + i.toString()] = data[i]
        }

        var query = connection.query('INSERT INTO controllerpacket SET ?', packet, function (error, results, fields) {
            if (error) {
                container.logger.error('mysqlIntegration error: \n\t%s \n\t%s', query.sql, JSON.stringify(error));
            }
            else {
                // console.log('mysql results: ', results)
                // console.log('mysql fields: ', JSON.stringify(fields))
            }
        })
    })

    e.on('pumppacket', function (data, counter) {
        // var chkhigh = data[data.length - 2];
        // var chklow = data[data.length - 1];
        var src = data[container.constants.pumpPacketFields.FROM];
        var dest = data[container.constants.pumpPacketFields.DEST];
        var action = data[container.constants.pumpPacketFields.ACTION]


        var packet = {counter: counter, raw_packet: data.toString(), action: action, src: src, dest: dest}
        //, chkhigh: chkhigh, chklow: chklow};

        for (var i = 0; i <= data.length - 1; i++) {
            packet['p' + i.toString()] = data[i]
        }

        var query = connection.query('INSERT INTO pumppacket SET ?', packet, function (error, results, fields) {
            if (error) {
                container.logger.error('mysqlIntegration error: \n\t%s \n\t%s', query.sql, JSON.stringify(error));
            }
            else {
                // console.log('mysql results: ', results)
                // console.log('mysql fields: ', JSON.stringify(fields))
            }
        });

    })


    e.on('chlorinatorpacket', function (data, counter) {
        // var chklow = data[data.length - 3];
        var action = data[container.constants.chlorinatorPacketFields.ACTION]


        var packet = {counter: counter, raw_packet: data.toString(), action: action}

        for (var i = 0; i <= data.length - 1; i++) {
            packet['p' + i.toString()] = data[i]
        }

        var query = connection.query('INSERT INTO chlorinatorpacket SET ?', packet,
            function (error, results, fields) {
                if (error) {
                    container.logger.error('mysqlIntegration error: \n\t%s \n\t%s', query.sql, JSON.stringify(error));
                }
                else {
                    // console.log('mysql results: ', results)
                    // console.log('mysql fields: ', JSON.stringify(fields))
                }
            })
    })

    return {
        init: init
    }
}
