export const cleanBuilderName = (name) => String(name || "").trim().replace(/\s+/g," ");
export const builderKey = (name) => cleanBuilderName(name).toLowerCase();
export function validateBuilderName(name) {
  const value=cleanBuilderName(name);
  if(!value||value.length>160)throw Error("Enter a customer / builder name between 1 and 160 characters.");
  return value;
}
export const findBuilder = (items,name) => items.find(item=>item.active!==false&&builderKey(item.name)===builderKey(name));
