import { logger } from "../../logger/Logger";
import { Inbound, Outbound } from "../../controller/comms/messages/Messages";
import { conn } from "../../controller/comms/Comms";

export class MockChlorinator {
  constructor(){}

  public process(inbound: Inbound){
    let response: Outbound = Outbound.create({
      portId: inbound.portId,
      protocol: inbound.protocol,
      dest: 0
    });

    switch (inbound.action){
      case 0: // Set control OCP->Chlorinator: [16,2,80,0][0][98,16,3]
        this.chlorSetControl(inbound, response);
      case 17: // OCP->Chlorinator set output. [16,2,80,17][15][130,16,3]
        this.chlorSetOutput(inbound, response);
        case 19: // iChlor keep alive(?) [16, 2, 80, 19][117, 16, 3]
        // need response   
        break;
      case 20: // OCP->Chlorinator Get model [16,2,80,20][0][118,16,3]
        this.chlorGetModel(inbound, response);
      default:
        logger.info(`No mock chlorinator response for ${inbound.toShortPacket()} `);
    }
  }

   public async chlorSetControl(inbound: Inbound, response: Outbound){
    /*     
    {"port":0,"id":42633,"valid":true,"dir":"out","proto":"chlorinator","pkt":[[],[], [16,2,80,0], [0],[98,16,3]],"ts":"2022-07-19T21:45:59.959-0700"}
    {"port":0,"id":42634,"valid":true,"dir":"in","proto":"chlorinator","for":[42633],"pkt":[[],[],[16,2,0,1],[0,0],[19,16,3]],"ts": "2022-07-19T21:45:59.999-0700"} */
    try {

      response.action = 1;
      response.appendPayloadBytes(0, 2);
      await response.sendAsync()
    }
    catch (err){
      logger.error(`Error sending mock chlor packet ${response.toPacket}`);
    }
  }
  public  chlorSetOutput(inbound: Inbound, response: Outbound){
    /*     
    {"port":0,"id":42639,"valid":true,"dir":"out","proto":"chlorinator","pkt":[[],[], [16,2,80,17], [100],[215,16,3]],"ts":"2022-07-19T21:46:00.302-0700"}
    {"port":0,"id":42640,"valid":true,"dir":"in","proto":"chlorinator","for":[42639],"pkt":[[],[],[16,2,0,18],[78,128],[242,16,3]],"ts": "2022-07-19T21:46:00.341-0700"} */
      response.action = 18;
      response.appendPayloadBytes(0, 2);
      // ideal high = 4500 = 90 * 50; ideal low = 2800 = 56 * 50
      response.setPayloadByte(0, this.random(90-56, true)+56, 75)
      response.setPayloadByte(1, 128); 
      conn.queueSendMessage(response);
  }
  public chlorGetModel(inbound: Inbound, response: Outbound){
    /*  
    {"port":0,"id":42645,"valid":true,"dir":"out","proto":"chlorinator","pkt":[[],[], [16,2,80,20], [0],[118,16,3]],"ts":"2022-07-19T21:46:00.645-0700"}   
    {"port":0,"id":42646,"valid":true,"dir":"in","proto":"chlorinator","for":[42645],"pkt":[[],[],[16,2,0,3],[0,73,110,116,101,108,108,105,99,104,108,111,114,45,45,54,48],[190,16,3]],"ts": "2022-07-19T21:46:00.700-0700"}   */
    response.action = 3;
    response.appendPayloadBytes(0, 17);
    response.insertPayloadString(1, 'INTELLICHLOR--60');
    conn.queueSendMessage(response);
  }

  private random(bounds: number, onlyPositive: boolean = false){
    let rand = Math.random() * bounds;
    if (!onlyPositive) {
      if (Math.random()<=.5) rand = rand * -1;
    }
    return rand;
  }

}

export var mockChlor: MockChlorinator = new MockChlorinator();