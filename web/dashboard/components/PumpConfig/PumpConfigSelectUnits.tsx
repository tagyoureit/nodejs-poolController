import {Row, Col, Button, ButtonGroup, Nav, NavItem, Dropdown, DropdownItem, DropdownToggle, DropdownMenu, NavLink, ButtonDropdown} from "reactstrap";
import {setPumpConfigUnits} from "../Socket_Client";
import * as React from "react";

interface Props {
  rate: number;
  currentPump: number;
  units: 0|1;
  pumpConfigId: number;
}
interface State {
  dropdownOpen: boolean;
}

class PumpConfigSelectUnits extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.toggle=this.toggle.bind(this);
    this.handleClick=this.handleClick.bind(this);
    this.state={dropdownOpen: false};
  }

  handleClick(event: any) {
    console.log(`changing pump ${this.props.currentPump} circuitSlot ${this.props.pumpConfigId} type to ${event.target.value}`);
    setPumpConfigUnits(this.props.currentPump, this.props.pumpConfigId, event.target.value);
  }

  toggle() {
    this.setState({
      dropdownOpen: !this.state.dropdownOpen
    });
  }
  render() {
    return (
      <ButtonDropdown
        size="sm"
        className="mb-1 mt-1"
        isOpen={this.state.dropdownOpen}
        toggle={this.toggle}
      >
        <DropdownToggle caret>
          {`${this.props.rate} ${this.props.units? "gpm":"rpm"}`}
        </DropdownToggle>
        <DropdownMenu>
          <DropdownItem value="0" onClick={this.handleClick}>
            rpm
          </DropdownItem>
          <DropdownItem value="1" onClick={this.handleClick}>
            gpm
          </DropdownItem>
        </DropdownMenu>
      </ButtonDropdown>
    );
  }
}

export default PumpConfigSelectUnits;
