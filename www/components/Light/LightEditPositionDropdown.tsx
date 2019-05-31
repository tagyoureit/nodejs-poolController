import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setLightPosition } from '../Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';




interface Props
{
  data: Circuit.LightClass
  numLights: number
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetPosition: number
}

class LightPosition extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetPosition: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind( this )

  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    if ( this.state.disabled && (this.state.targetPosition===this.props.data.position) )
    {
      this.setState( {
        disabled: false,
        targetPosition: 0
      } );
    }
  }
    
  toggleDropDown ()
  {
    this.setState( {
      dropdownOpen: !this.state.dropdownOpen
    } );
  }

  handleClick (event: any)
  {
    console.log(`this.props.data.circuit, event.target.value: ${this.props.data.circuit}, ${event.target.value}`)
    setLightPosition( this.props.data.circuit, event.target.value )
    this.setState( {
      disabled: true,
      targetPosition: parseInt(event.target.value)
    } );
  }

  render ()
  {
    const positions = () =>
    {
      let positionArray: number[] = [] 
      for ( let i = 1; i <= this.props.numLights; i++ )
      {
        positionArray.push(i)
      }

      return (
      <>
         {positionArray.map( i => (
          ( <DropdownItem
            key={`light${ this.props.data.circuit }${ i }`}
            onClick={this.handleClick}
            value={i}
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
            {this.props.data.position}
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