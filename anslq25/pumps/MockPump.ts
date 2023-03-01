import { sys } from "../../controller/Equipment";
import { PumpState, state } from "../../controller/State";
import { Outbound } from "../../controller/comms/messages/Messages";
import { conn } from "controller/comms/Comms";

export class MockPump {
  constructor(){}

  public process(outboundMsg: Outbound){
    let response: Outbound = Outbound.create({
      portId: outboundMsg.portId,
      protocol: outboundMsg.protocol
    });

    switch (outboundMsg.action){
      case 7:
        this.pumpStatus(outboundMsg, response);
      default:
        this.pumpAck(outboundMsg, response);
    }
  }

  public pumpStatus(outboundMsg: Outbound, response: Outbound){
    let pState:PumpState = state.pumps.getItemById(outboundMsg.dest - 96);
    let pt = sys.board.valueMaps.pumpTypes.get(pState.type);
    response.action = 7;
    response.source = outboundMsg.dest;
    response.dest = outboundMsg.source;
    response.appendPayloadBytes(0, 15);
    response.setPayloadByte(0, pState.command, 2);
    response.setPayloadByte(1, pState.mode, 0);
    response.setPayloadByte(2, pState.driveState, 2);
    let watts = 0;
    if (Math.max(pState.rpm, pState.flow) > 0){
      if (pState.rpm > 0) watts = pState.rpm/pt.maxSpeed * 2000 + this.random(100);
      else if (pState.flow > 0) watts = pState.flow/pt.maxFlow * 2000 + this.random(100);
      else //ss, ds, etc
      watts = 2000 + this.random(250);
    }
    response.setPayloadByte(3, Math.floor(watts / 256), 0);
    response.setPayloadByte(4, watts % 256, 0);
    response.setPayloadByte(5, Math.floor(pState.rpm / 256), 0);
    response.setPayloadByte(6, pState.rpm % 256, 0);
    response.setPayloadByte(7, pState.flow, 0);
    response.setPayloadByte(8, pState.ppc, 0);
    // 9, 10 = unknown
    // 11, 12 = Status code; 
    response.setPayloadByte(11, Math.floor(pState.status / 256), 0);
    response.setPayloadByte(12, pState.status % 256, 1);
    let time = new Date();
    response.setPayloadByte(13, time.getHours() * 60);
    response.setPayloadByte(14, time.getMinutes());
    
    conn.queueSendMessage(response);
  }

  public pumpAck(outboundMsg: Outbound, response: Outbound){
    response.action = outboundMsg.action;
    response.source = outboundMsg.dest;
    response.dest = outboundMsg.source;
    switch (outboundMsg.action){
      case 1:
      case 10: {
        response.appendPayloadByte(outboundMsg.payload[2]);
        response.appendPayloadByte(outboundMsg.payload[3]);
        break;
      }
      default:    
        response.appendPayloadByte(outboundMsg.payload[0]);
      }
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

export var mockPump: MockPump = new MockPump();