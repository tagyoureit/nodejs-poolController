import { Row, Col, Button, Modal, ModalHeader, ModalBody, ModalFooter } from 'reactstrap';

import InfiniteCalendar from 'react-infinite-calendar';
import 'react-infinite-calendar/styles.css';
import Timekeeper from 'react-timekeeper';
import './modal.css'
import {setDateTime} from './Socket_Client'

class DateTime extends React.Component {
  constructor(props) {
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
    

  handleTimeChange(newTime) {
    // event when time picker is closed
    this.setState({ 
      time: newTime.formatted,
      timeObj: newTime,
      newVal: true
     })
  }

  handleDateChange(newDate){
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

    console.log(`state: ${JSON.stringify(this.state)}`)
    let newDate = new Date(this.props.locale)
    console.log(`props locale = ${this.props.locale}`)
    console.log(`new date Locale === ${newDate.toLocaleString()}`)
    console.log(`state.dateObj ${JSON.stringify(this.state.dateObj)}`)
    if (this.state.dateObj){
      newDate.setDate(this.state.dateObj.getDate())
      newDate.setMonth(this.state.dateObj.getMonth())
      newDate.setFullYear(this.state.dateObj.getFullYear())
    }
    console.log(`state.time ${JSON.stringify(this.state.timeObj)}`)
    if (this.state.timeObj) {
      newDate.setHours(this.state.timeObj.hour24)
      newDate.setMinutes(this.state.timeObj.minute)
    }

    console.log(`will update with ${newDate}`)
    
    console.log(`will update with ${newDate.toLocaleString()}`)
    setDateTime(newDate)
    this.toggle()
  }

  cancel() {
    // when cancel button is pressed reset state
    this.setState({ 
      time: 0,
      date: 0,
      newVal: false,
      modal: !this.state.modal
      })
  }

  render() {
    const closeBtn = <button className="close" onClick={this.cancel}>&times;</button>;

    return (
      <div>

        <Button color="primary" onClick={this.toggle}>
        {this.state.date ? this.state.date : this.props.date} {this.state.time ? this.state.time : this.props.time}
        </Button>
        <Modal isOpen={this.state.modal} toggle={this.toggle} size='xl' >
          <ModalHeader toggle={this.toggle} close={closeBtn}>Adjust time and date</ModalHeader>
          <ModalBody>
            <Row>
              <Col sm={{ size: 'auto', offset: 1 }}><InfiniteCalendar
                width={350}
                height={200}
                selected={this.state.date ? this.state.date : this.props.date}
                onSelect={this.handleDateChange}
              /></Col>
              <Col sm={{ size: 'auto', offset: 1 }}>
                <Timekeeper
                  time={this.state.time ? this.state.time : this.props.time}
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