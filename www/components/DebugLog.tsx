import
{
    Row, Col, Button, ButtonGroup, ButtonDropdown, DropdownToggle, DropdownMenu, DropdownItem
} from 'reactstrap';
import './rangeslider.css'

import CustomCard from './CustomCard'
import * as React from 'react';

interface Props
{
    debugText: string;
    id: string;
    visibility: string;
    clearLog: () => void;
}

interface State
{

}

class DebugLog extends React.Component<Props, State> {

    constructor( props: Props )
    {
        super( props )
    }



    render ()
    {
        return (
            <div className="tab-pane active" id="debug" role="tabpanel" aria-labelledby="debug-tab">
                <CustomCard name='Debug Log' id={this.props.id} visibility={this.props.visibility}>
                    <div contentEditable={false} className='boxsizingBorder' style={{ height: '200px', width: '100%', overflow: 'scroll' }} dangerouslySetInnerHTML={{ __html: this.props.debugText }}>
                    </div>
                </CustomCard>

            </div>
        );
    }
}

export default DebugLog;