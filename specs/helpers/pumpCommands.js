/*  PUMP 1  */

//Local/Remote
pump1RemotePacket = exports.pump1RemotePacket =  [ 165, 0, 96, 33, 4, 1, 255 ]
pump1LocalPacket = exports.pump1LocalPacket = [ 165, 0, 96, 33, 4, 1, 0 ]

//Request Status
pump1RequestStatusPacket = exports.pump1RequestStatusPacket = [ 165, 0, 96, 33, 7, 0 ]

//save speed to programs
pump1SetProgram1RPM500Packet = exports.pump1SetProgram1RPM500Packet = [ 165, 0, 96, 33, 1, 4, 3, 39, 1, 244 ]
pump1SetProgram2RPM500Packet = exports.pump1SetProgram2RPM500Packet = [ 165, 0, 96, 33, 1, 4, 3, 40, 1, 244 ]
pump1SetProgram1RPM1000Packet = exports.pump1SetProgram1RPM1000Packet = [ 165, 0, 96, 33, 1, 4, 3, 39, 3, 232 ]

pump1SetProgram1GPM15Packet = exports.pump1SetProgram1GPM15Packet = [165, 0, 96, 33, 1, 4, 3, 39, 0, 15]

//run speed (without program)
pump1SetRPM1000Packet = exports.pump1SetRPM1000Packet = [ 165, 0, 96, 33, 1, 4, 2, 196, 3, 232 ]

//Power
pump1PowerOnPacket = exports.pump1PowerOnPacket = [ 165, 0, 96, 33, 6, 1, 10 ]
pump1PowerOffPacket = exports.pump1PowerOffPacket = [ 165, 0, 96, 33, 6, 1, 4 ]

//Timer
pump1SetTimerPacket = exports.pump1SetTimerPacket = [ 165, 0, 96, 33, 1, 4, 3, 43, 0, 1 ]

//Programs
pump1StopProgram = exports.pump1StopProgram = [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 0 ]
pump1RunProgram1Packet = exports.pump1RunProgram1Packet = [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 8 ]
pump1RunProgram2Packet = exports.pump1RunProgram2Packet = [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 16 ]
pump1RunProgram3Packet = exports.pump1RunProgram3Packet = [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 24 ]
pump1RunProgram4Packet = exports.pump1RunProgram4Packet = [ 165, 0, 96, 33, 1, 4, 3, 33, 0, 32 ]


/*  PUMP 2  */
//Local/Remote
pump2RemotePacket = exports.pump2RemotePacket =  [ 165, 0, 97, 33, 4, 1, 255 ]
pump2LocalPacket = exports.pump2LocalPacket = [ 165, 0, 97, 33, 4, 1, 0 ]

//Request Status
pump2RequestStatusPacket = exports.pump2RequestStatusPacket = [ 165, 0, 97, 33, 7, 0 ]
pump2SetProgram1RPM500Packet = exports.pump2SetProgram1RPM500Packet = [ 165, 0, 97, 33, 1, 4, 3, 39, 1, 244 ]  //checksum right?
pump2SetProgram2RPM500Packet = exports.pump2SetProgram2RPM500Packet = [ 165, 0, 97, 33, 1, 4, 3, 40, 1, 244 ]
pump2SetProgram1RPM1000Packet = exports.pump2SetProgram1RPM1000Packet = [ 165, 0, 97, 33, 1, 4, 3, 39, 3, 232 ]
pump2SetProgram4RPM3450Packet = exports.pump2SetProgram4RPM3450Packet = [ 165, 0, 97, 33, 1, 4, 3, 42, 13, 122 ]

//Power
pump2PowerOnPacket = exports.pump2PowerOnPacket = [ 165, 0, 97, 33, 6, 1, 10 ]
pump2PowerOffPacket = exports.pump2PowerOffPacket = [ 165, 0, 97, 33, 6, 1, 4 ]

//Timer
pump2SetTimerPacket = exports.pump2SetTimerPacket = [ 165, 0, 97, 33, 1, 4, 3, 43, 0, 1 ]

//Programs
pump2StopProgram = exports.pump2StopProgram = [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 0 ]
pump2RunProgram1Packet = exports.pump2RunProgram1Packet = [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 8 ]
pump2RunProgram2Packet = exports.pump2RunProgram2Packet = [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 16 ]
pump2RunProgram3Packet = exports.pump2RunProgram3Packet = [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 24 ]
pump2RunProgram4Packet = exports.pump2RunProgram4Packet = [ 165, 0, 97, 33, 1, 4, 3, 33, 0, 32 ]
