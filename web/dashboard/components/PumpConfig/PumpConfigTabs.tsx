import {
  Row,
  Col,
  Container,
  Button,
  ButtonGroup,
  Nav,
  NavItem,
  Dropdown,
  DropdownItem,
  DropdownToggle,
  DropdownMenu,
  NavLink,
  ButtonDropdown
} from "reactstrap";
import * as React from "react";
import PumpConfigSelectType from "./PumpConfigSelectType";
import PumpConfigSelectCircuit from "./PumpConfigSelectCircuit";
import PumpConfigSelectUnits from "./PumpConfigSelectUnits";
import PumpConfigSelectSpeedSlider from "./PumpConfigSelectSpeedSlider";
import {
  IConfigPump,
  getItemById,
  IConfigPumpCircuit,
  IStatePoolPump
} from "../PoolController";

interface Props {
  pumpConfig: IConfigPump;
  currentPump: number;
  pumpState: IStatePoolPump;
  condensedCircuitsAndFeatures: {id: number; name: string; type: string}[];
}
interface State {
  currentPump: number;
}
class PumpConfigTabs extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state={
      currentPump:
        typeof this.props.currentPump==="undefined"
          ? 1
          :this.props.currentPump
    };
  }
  componentDidUpdate(prevProps, prevState) {
    if(prevState.currentPump!==this.props.currentPump) {
      this.setState({currentPump: this.props.currentPump});
    }
  }
  render() {
    const CircuitSelectors=() => {
      if(this.props.pumpConfig.type===0)
        return <div>Select a pump type to edit circuits</div>;
      const circRows: React.ReactFragment[]=[];
      for(let idx=1;idx<=8;idx++) {
        let circ: IConfigPumpCircuit=getItemById(this.props.pumpConfig.circuits, idx);

        if(!circ) {
          switch(this.props.pumpConfig.type) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
              circ={id: idx, circuit: 0, speed: 0, units: 0};
              break;
            case 5:
              circ={id: idx, circuit: 0, speed: 0, units: 1};
              break;
          }
        };
        let unitsDisplayOrSelect: React.ReactFragment=`${circ.speed} ${circ.units? 'gpm':'rpm'}`;
        if(this.props.pumpConfig.type===4) {
          unitsDisplayOrSelect=(
            <PumpConfigSelectUnits
              currentPump={this.state.currentPump}
              pumpConfigId={circ.id}
              rate={circ.units? circ.flow:circ.speed}
              units={circ.units}
            />
          );
        }
        circRows.push(
          <Row key={`${this.state.currentPump}${circ.circuit}${idx}`}>
            <Col className="col-4">
              Circuit{" "}
              <PumpConfigSelectCircuit
                currentPump={this.state.currentPump}
                circuitName={
                  getItemById(
                    this.props.condensedCircuitsAndFeatures,
                    circ.circuit
                  ).name
                }
                currentCircuitSlotNumber={circ.id}
                condensedCircuitsAndFeatures={
                  this.props.condensedCircuitsAndFeatures
                }
              />
            </Col>
            <Col className="col">
              <PumpConfigSelectSpeedSlider
                currentPump={this.props.currentPump}
                currentCircuitSlotNum={circ.id}
                currentSpeed={circ.units? circ.flow:circ.speed}
                units={circ.units}
              />
            </Col>
            <Col className="col-3">{unitsDisplayOrSelect}</Col>
          </Row>
        );
      }
      return circRows;
    };
    return (
      <Container>
        <Row>
          <Col>
            Type{" "}
            <PumpConfigSelectType
              currentPumpType={this.props.pumpConfig.type}
              currentPump={this.state.currentPump}
            />
          </Col>
        </Row>
        {CircuitSelectors()}
      </Container>
    );
  }
}

export default PumpConfigTabs;
