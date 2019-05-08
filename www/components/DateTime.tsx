import { Row, Col, Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';

import InfiniteCalendar from 'react-infinite-calendar';
import 'react-infinite-calendar/styles.css';
import Timekeeper from 'react-timekeeper';
import './modal.css'
import {setDateTime} from './Socket_Client'
import * as React from 'react';


interface State
{
  modal: boolean,
  newVal: boolean,
  time?: number,
  timeObj?: any, // TODO: get more specific
  date?: string,
  dateObj?: any // TODO: get more specific
}

class DateTime extends React.Component<WWW.ISysInfo, State> {
  constructor( props: WWW.ISysInfo) {
    super(props);
    this.state = {
      modal: false,
      newVal: false
    };
  
    this.toggle = this.toggle.bind(this)
    this.submit = this.submit.bind(this);
    this.handleTimeChange = this.handleTimeChange.bind(this)
    this.handleDateChange = this.handleDateChange.bind(this)
    this.cancel = this.cancel.bind(this)
  }
    

  handleTimeChange ( newTime: any) {
    // event when time picker is closed
    this.setState({ 
      time: newTime.formatted,
      timeObj: newTime,
      newVal: true
     })
  }

  handleDateChange(newDate: any){
    // event when date picker is closed
    this.setState({
      date: `${newDate.getMonth()+1}/${newDate.getDate()}/${newDate.getFullYear()}`,
      dateObj: newDate,
      newVal: true
    })
  }

  toggle(){
    // open and close the modal
    this.setState({
      modal: !this.state.modal
    });
  }

  submit() {
    // submit changes to socket

    let newDate = new Date(this.props.locale)
    if (this.state.dateObj){
      newDate.setDate(this.state.dateObj.getDate())
      newDate.setMonth(this.state.dateObj.getMonth())
      newDate.setFullYear(this.state.dateObj.getFullYear())
    }
    if (this.state.timeObj) {
      newDate.setHours(this.state.timeObj.hour24)
      newDate.setMinutes(this.state.timeObj.minute)
    }
    setDateTime(newDate)
    this.toggle()
  }

  cancel() {
    // when cancel button is pressed reset state
    this.setState({ 
      time: 0,
      date: 'notset',
      newVal: false,
      modal: !this.state.modal
      })
  }

  render() {
    const closeBtn = <button className="close" onClick={this.cancel}>&times;</button>;

    return (
      <div>

        <Button color="primary" onClick={this.toggle}>
        {this.state.date ? this.state.date : this.props.controllerDateStr} {this.state.time ? this.state.time : this.props.controllerTime}
        </Button>
        <Modal isOpen={this.state.modal} toggle={this.toggle} size='xl' >
          <ModalHeader toggle={this.toggle} close={closeBtn}>Adjust time and date</ModalHeader>
          <ModalBody>
            <Row>
              <Col sm={{ size: 'auto', offset: 1 }}><InfiniteCalendar
                width={350}
                height={200}
                selected={this.state.date ? this.state.date : this.props.controllerDateStr}
                onSelect={this.handleDateChange}
              /></Col>
              <Col sm={{ size: 'auto', offset: 1 }}>
                <Timekeeper
                  time={this.state.time ? this.state.time : this.props.controllerTime}
                  onChange={this.handleTimeChange} 
                  switchToMinuteOnHourSelect={true}
                  />
              </Col>
            </Row>


          </ModalBody>
          <ModalFooter>

            <Button color={this.state.newVal?'primary':'secondary'} onClick={this.submit}>{this.state.newVal?'Update':'Cancel'}</Button>

          </ModalFooter>
        </Modal>
      </div>
    );
  }
}

export default DateTime;