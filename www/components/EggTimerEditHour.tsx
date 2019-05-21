import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setLightPosition } from './Socket_Client'
import * as React from 'react';


interface Props
{
  currentHour: number
  currentScheduleId: number
  onClick: (event: any)=>void
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetHour: number
}

class LightPosition extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetHour: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind(this)
  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.state.disabled && ( this.state.targetHour === this.props.currentHour ) )
    {
      this.setState( {
        disabled: false,
        targetHour: -1
      } );
    }
  }

  handleClick (event: any)
  {
    this.props.onClick( event )
    this.setState( {
      disabled: true,
      targetHour: parseInt(event.target.value)
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
    const positions = () =>
    {
      let hoursArray: number[] = []
      for ( let i = 1; i <= 12; i++ )
      {
        hoursArray.push( i )
      }

      return (
        <>
          {hoursArray.map( i => (
            ( <DropdownItem
              key={`hour${ i }`}
              onClick={this.handleClick}
              value={i}
              data-schedule-id={this.props.currentScheduleId}
              data-type='hour'
              className={this.props.currentHour === i  ? 'dropdown-item-checked' : ''}
            >
              {i}
            </DropdownItem> )

          ) )}
        </>
      )
    }

    return (


      <div>
        <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} disabled={this.state.disabled} >
          <DropdownToggle caret disabled={this.state.disabled}>
            {this.props.currentHour}{''}
          </DropdownToggle>
          <DropdownMenu>
            {positions()}
          </DropdownMenu>
        </ButtonDropdown>

      </div >

    )
  }
}

export default LightPosition;