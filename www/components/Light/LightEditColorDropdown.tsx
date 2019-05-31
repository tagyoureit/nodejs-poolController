import { Container, Row, Col, Button, Table, Dropdown, ButtonDropdown, DropdownToggle, DropdownItem, DropdownMenu } from 'reactstrap'
import { setLightColor } from '../Socket_Client'
import Slider from 'react-rangeslider'
import 'react-rangeslider/lib/index.css'
import '../../css/rangeslider.css'
import * as React from 'react';




interface Props
{
  data: Circuit.LightClass
}

interface State
{
  dropdownOpen: boolean
  disabled: boolean
  targetColor: number
}

class LightColor extends React.Component<Props, State> {
  constructor( props: Props )
  {
    super( props )

    this.state = {
      dropdownOpen: false,
      disabled: false,
      targetColor: -1
    }
    this.toggleDropDown = this.toggleDropDown.bind( this )
    this.handleClick = this.handleClick.bind( this )

  }
  componentDidUpdate ( prevProps: Props, prevState: State )
  {
    //Todo: this isn't re-enabling when we get the right color back
    // enable button when we get new data
    if ( this.state.disabled && (this.state.targetColor===this.props.data.color) )
    {
      this.setState( {
        disabled: false,
        targetColor: 0
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
    setLightColor( this.props.data.circuit, event.target.value )
    this.setState( {
      disabled: true,
      targetColor: parseInt(event.target.value)
    } );
  }

  render ()
  {
    const colorVal = () =>
    {
      switch ( this.props.data.colorSet )
      {
        case 0:
          return { color: 'white', background: 'gray' }
          break;
        case 2:
          return { background: 'white', color: 'lightgreen' }
          break;
        case 4:
          return { background: 'white', color: 'green'}
          break;
        case 6:
          return { background: 'white', color: 'cyan' }
          break;
        case 8:
        return { background: 'white', color: 'blue' }
        break;
        case 10:
          return { background: 'white', color: 'lavender' }
          break;
        case 12:
          return { background: 'white', color: 'darkmagenta' }
          break;      
        case 14:
          return { background: 'white', color: 'magenta' }
          break;      
      }
    }

    return (


      <div>
        <ButtonDropdown isOpen={this.state.dropdownOpen} toggle={this.toggleDropDown} disabled={this.state.disabled} >
          <DropdownToggle caret style={colorVal()}  disabled={this.state.disabled}>
            {this.props.data.colorSetStr}
                    </DropdownToggle>
          <DropdownMenu>
            <DropdownItem key={`${this.props.data.circuit}0`} onClick={this.handleClick} value='0' style={{ color: 'white', background: 'gray' }}>White</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}2`} onClick={this.handleClick} value='2' style={{ color:'lightgreen' }}>Light Green</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}4`} onClick={this.handleClick} value='4' style={{ color:'green' }}>Green</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}6`} onClick={this.handleClick} value='6' style={{ color:'cyan' }}>Cyan</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}8`} onClick={this.handleClick} value='8' style={{ color:'blue' }}>Blue</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}10`} onClick={this.handleClick} value='10' style={{ color:'lavender' }}>Lavender</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}12`} onClick={this.handleClick} value='12' style={{ color:'darkmagenta' }}>Magenta</DropdownItem>
            <DropdownItem key={`${this.props.data.circuit}`} onClick={this.handleClick} value='14' style={{ color:'magenta' }}>Light Magenta</DropdownItem>
          </DropdownMenu>
        </ButtonDropdown>

      </div >

    )
  }
}

export default LightColor;