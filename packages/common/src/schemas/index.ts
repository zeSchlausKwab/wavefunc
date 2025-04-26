// Export each schema module with namespaces to avoid naming conflicts
import * as StationSchemas from './station'
import * as RadioSchemas from './radio'
import * as UserSchemas from './user'
import * as DvmSchemas from './dvm'
import * as EventSchemas from './events'
import * as FormSchemas from './forms'

export { StationSchemas, RadioSchemas, UserSchemas, DvmSchemas, EventSchemas, FormSchemas }
