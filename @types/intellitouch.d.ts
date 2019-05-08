declare namespace Intellitouch
{
    interface ControllerSettings
    {
        appAddress: number
        needConfiguration: number
        preambleByte: number
    }

    function init(): void
    function getControllerConfiguration(): void
    function setPreambleByte (): void
    function getPreambleByte (): number
    function checkIfNeedControllerConfiguration (): number
    
}