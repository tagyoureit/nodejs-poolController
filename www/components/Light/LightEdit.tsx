import { Container, Row, Col, Button, Table, DropdownMenu, ButtonDropdown, Dropdown, DropdownItem, DropdownToggle } from 'reactstrap'
import { setChlorinatorLevels } from '../Socket_Client'

import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';
import LightColor from './LightEditColorDropdown'
import LightPosition from './LightEditPositionDropdown'
import LightSwimDelay from './LightEditSwimDelay';




interface State
{
  dropdownOpen: boolean
}
interface Props
{
  data: Circuit.ICurrentCircuitsArr
}

class LightEdit extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind( this )
  }

  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }

  handleClick ()
  {

  }

  render ()
  {


    let lightData =
      Object.entries( this.props.data ).map( ( circ: [ string, Circuit.CircuitBase ], index: number ) =>
      {
        return ( <tr key={`lightCircuit${ circ[1].number }`
      }>
          <td>
            {circ[ 1 ].number}
          </td>
          <td>
            {circ[ 1 ].friendlyName}
          </td>
          <td>
            <LightColor data={circ[ 1 ].light} />
          </td>
          <td>
            <LightPosition data={circ[ 1 ].light} numLights={Object.keys(this.props.data).length}/>
          </td>
          <td>
            <LightSwimDelay data={circ[ 1 ].light} />
          </td>
        </tr> )
      } )




    const heightStyle = {
      height: '300px'
    }
    // const customPercentLabels = { 0: "Off", 50: "50%", 100: "100%" };
    // const customTimeLabels = { 0: "Off", 12: "12", 24: "24" };

    return (

      <div>
        <Container style={heightStyle} >
          <Table>
            <thead>
              <tr>
                <th>#</th>
                <th>Circuit</th>
                <th>Color</th>
                <th>Position</th>
                <th>Delay</th>
              </tr>
            </thead>
            <tbody>
              {lightData}
            </tbody>

          </Table>
        </Container>

      </div >

    )
  }
}

export default LightEdit;