import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setScheduleCircuit } from '../Socket_Client'
import * as React from 'react';
import '../../css/dropdownselect.css'

interface Props
{
  data: Circuit.ICurrentCircuitsArr
  currentScheduleId: number
  currentCircuit: number
  onClick: (event: any)=>void
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetCircuitNum: number
}

class EggTimerCircuit extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetCircuitNum: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind(this)


  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.state.disabled && ( this.state.targetCircuitNum === this.props.currentCircuit ))
    {
      this.setState( {
        disabled: false,
        targetCircuitNum: -1,
      } );
    }
  }

  handleClick (event: any)
  {
    this.props.onClick( event )
    this.setState( {
      disabled: true,
      targetCircuitNum: parseInt(event.target.value)
    })
  }

  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }



  render ()
  {


    const circuits = () =>
    {
      let circuitArray: number[] = Object.keys( this.props.data ).map( key => parseInt( key ) )

      return (
        <>
          {circuitArray.map( i => (
            ( <DropdownItem
              key={`eggTimer${ this.props.data[ i ].number }${ i }`}
              onClick={this.handleClick}
              data-schedule-id={this.props.currentScheduleId}
              data-type='circuit'
              value={this.props.data[ i ].number}
              className={this.props.currentCircuit === i ? 'dropdown-item-checked' : ''}
            >
              {this.props.data[ i ].friendlyName} ({this.props.data[ i ].number})
          </DropdownItem> )

          ) )}
        </>
      )
    }
    return (
      <div>
        <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} disabled={this.state.disabled} >
          <DropdownToggle caret disabled={this.state.disabled} color='primary'>
            {this.props.data[ this.props.currentCircuit ].friendlyName} ({this.props.data[ this.props.currentCircuit ].number})
                    </DropdownToggle>
          <DropdownMenu>
            {circuits()}
          </DropdownMenu>
        </ButtonDropdown>
      </div >
    )
  }
}

export default EggTimerCircuit;