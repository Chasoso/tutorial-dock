cmake_minimum_required(VERSION 3.20)
project(yaml_cpp_patch_qualification LANGUAGES CXX)

if(NOT MSVC)
    message(FATAL_ERROR "The Windows qualification must use MSVC.")
endif()
if(NOT CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION)
    message(FATAL_ERROR "The Windows qualification must report its Windows SDK version.")
endif()

message(STATUS "QUALIFICATION_COMPILER=MSVC ${CMAKE_CXX_COMPILER_VERSION}")
message(STATUS "QUALIFICATION_WINDOWS_SDK=${CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION}")

if(NOT DEFINED YAML_CPP_SOURCE_DIR OR NOT EXISTS "${YAML_CPP_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "YAML_CPP_SOURCE_DIR must point to the checked-out yaml-cpp source.")
endif()

option(QUALIFY_PATCHED "Expect the quoted-scalar newline patch to be applied" OFF)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded" CACHE STRING "Use the static MSVC runtime" FORCE)

set(YAML_BUILD_SHARED_LIBS OFF CACHE BOOL "Build yaml-cpp statically" FORCE)
set(YAML_CPP_BUILD_TESTS OFF CACHE BOOL "Do not build upstream test dependencies" FORCE)
set(YAML_CPP_BUILD_TOOLS OFF CACHE BOOL "Do not build yaml-cpp tools" FORCE)
set(YAML_CPP_BUILD_CONTRIB OFF CACHE BOOL "Do not build yaml-cpp contrib" FORCE)
set(YAML_CPP_INSTALL OFF CACHE BOOL "Do not install yaml-cpp" FORCE)
set(YAML_MSVC_SHARED_RT OFF CACHE BOOL "Use /MT for yaml-cpp" FORCE)

add_subdirectory("${YAML_CPP_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/yaml-cpp")

configure_file(fixtures/folded-keep-input.hex folded-keep-input.hex COPYONLY)

add_executable(yaml_cpp_compatibility_tests compatibility_tests.cpp)
add_executable(yaml_cpp_resource_bounds_tests resource_bounds_tests.cpp resource_bounds_main.cpp)

foreach(target yaml_cpp_compatibility_tests yaml_cpp_resource_bounds_tests)
    target_link_libraries(${target} PRIVATE yaml-cpp::yaml-cpp)
    target_compile_features(${target} PRIVATE cxx_std_17)
    if(MSVC)
        target_compile_options(${target} PRIVATE /utf-8 /W4)
        target_compile_definitions(${target} PRIVATE _CRT_SECURE_NO_WARNINGS)
    endif()
endforeach()

if(QUALIFY_PATCHED)
    target_compile_definitions(yaml_cpp_compatibility_tests PRIVATE QUALIFY_PATCHED=1)
endif()

enable_testing()
add_test(NAME compatibility COMMAND yaml_cpp_compatibility_tests)
add_test(NAME resource-bounds COMMAND yaml_cpp_resource_bounds_tests)
set_tests_properties(compatibility resource-bounds PROPERTIES
    TIMEOUT 60
    WORKING_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}")
