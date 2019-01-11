import DayPicker from 'react-day-picker';
import 'react-day-picker/lib/style.css';

class Date extends React.Component {
    constructor(props) {
        super(props);

      }
      
      render() {
        return (
          <div>
          <DayPicker />

          </div>
        );
      }
    }

export default Date;