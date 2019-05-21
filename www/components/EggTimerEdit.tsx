import { Container, Row, Col, Button, Table, DropdownMenu, ButtonDropdown, Dropdown, DropdownItem, DropdownToggle, Breadcrumb } from 'reactstrap'
import { setEggTimer } from './Socket_Client'
import 'react-rangeslider/lib/index.css'
import '../css/rangeslider.css'
import * as React from 'react';
import EggTimerCircuit from './EggTimerEditCircuit'
import EggTimerHour from './EggTimerEditHour'
import EggTimerMinute from './EggTimerEditMinute';




interface State
{
  dropdownOpen: boolean
}
interface Props
{
  data: ScheduleModule.ScheduleObj
  allCircuits: Circuit.ICurrentCircuitsArr
}

class EggTImerEdit extends React.Component<Props, State> {
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

  handleClick ( event: any )
  {

    console.log( `type: ${ event.target.getAttribute( 'data-type' ) }  sched id: ${ parseInt( event.target.getAttribute( 'data-schedule-id' ) ) } circuitNum: ${ event.target.value }  ` )
    
    let _id = parseInt( event.target.getAttribute( 'data-schedule-id' ) )
    let _circuitNum = this.props.data[ _id ].circuitNum
    let _hour = this.props.data[ _id ].duration.hour
    let _minute = this.props.data[ _id ].duration.minute

    switch ( event.target.getAttribute( 'data-type' ) )
    {
      case 'circuit':
        _circuitNum = event.target.value
        break;
      case 'hour':
        _hour = event.target.value;
        break;
      case 'minute':
        _minute = event.target.value
        break;

      }
      
      setEggTimer( _id, _circuitNum, _hour, _minute )
  }

  render ()
  {

    let eggTimerData =
      Object.entries( this.props.data ).map( ( eggTimer: [ string, ScheduleModule.ScheduleClass ], index: number ) =>
      {
        return ( <tr key={`eggTimerCircuit${ eggTimer[ 1 ].id }`
        }>
          <td>
            {eggTimer[ 1 ].id}
          </td>
          <td>
            <EggTimerCircuit data={this.props.allCircuits} currentScheduleId={eggTimer[ 1 ].id} currentCircuit={eggTimer[ 1 ].circuitNum} onClick={this.handleClick} />
          </td>
          <td>
            <EggTimerHour currentHour={eggTimer[ 1 ].duration.hour} currentScheduleId={eggTimer[ 1 ].id} onClick={this.handleClick} />
          </td>
          <td>
            <EggTimerMinute currentMinute={eggTimer[ 1 ].duration.minute} currentScheduleId={eggTimer[ 1 ].id} onClick={this.handleClick} />
          </td>
        </tr> )
      } )

    const heightStyle = {
      height: 63 * (Object.keys( this.props.data ).length) + 32
    }
    return (
      <div>
        <Container style={heightStyle} >
          <Table>
            <thead>
              <tr>
                <th>Schedule ID</th>
                <th>Circuit (#)</th>
                <th>Hours</th>
                <th>Minutes</th>
              </tr>
            </thead>
            <tbody>
              {eggTimerData}
            </tbody>

          </Table>
        </Container>

      </div >

    )
  }
}

export default EggTImerEdit;